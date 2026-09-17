const http = require("node:http");
const { expect } = require("chai");
const puppeteer = require("puppeteer");

const fixture = require("./fixtures/calendar.json");
const appModule = require("../app");
const { CALENDAR_MAP } = require("../config");

async function startServer(scraper) {
  const server = http.createServer(appModule.createApp({ scraper }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function launchPage(baseUrl, acceptLanguage = "en-US") {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setExtraHTTPHeaders({ "Accept-Language": acceptLanguage });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  return { browser, page };
}

describe("Google Slot Proxy", function () {
  this.timeout(process.env.LIVE_CALENDAR_TESTS ? 180000 : 30000);

  it("renders the homepage with all configured calendars", async () => {
  const { server, baseUrl } = await startServer();
  try {
  const { browser, page } = await launchPage(baseUrl);
    try {
      expect((await page.$$(".cal-card")).length).to.equal(Object.keys(CALENDAR_MAP).length);
      expect(await page.$eval("html", (html) => html.lang)).to.equal("en");
      expect(await page.$eval("h1", (heading) => heading.textContent.trim())).to.equal("📅 Book an appointment");
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});

  it("switches locale through the language selector", async () => {
  const { server, baseUrl } = await startServer();
  try {
  const { browser, page } = await launchPage(baseUrl, "en-US");
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.evaluate(() => {
          const selector = document.querySelector("#language-selector");
          selector.value = "fr";
          selector.dispatchEvent(new Event("change", { bubbles: true }));
        }),
      ]);
      await page.goto(`${baseUrl}/?lang=fr`, { waitUntil: "domcontentloaded" });
      expect(await page.$eval("html", (html) => html.lang)).to.equal("fr");
      expect(await page.$eval("h1", (heading) => heading.textContent.trim())).to.equal("📅 Prendre rendez-vous");
      expect(page.url()).to.match(/lang=fr/);
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});

  it("loads a calendar page and renders fixture API data", async () => {
  const scraper = async () => fixture;
  const { server, baseUrl } = await startServer(scraper);
  try {
  const { browser, page } = await launchPage(`${baseUrl}/30min`);
    try {
      await page.waitForSelector("#results.visible");
      expect(await page.$eval("#loading", (loading) => getComputedStyle(loading).display)).to.equal("none");
      expect(await page.$eval("#timezone-selector", (selector) => selector.disabled)).to.equal(false);
      expect(await page.$$eval("#timezone-selector option", (options) => options.map((option) => option.value))).to.include("Europe/Paris");
      expect((await page.$$(".day-card")).length).to.equal(fixture.days.length);
      expect((await page.$$(".slot")).length).to.equal(2);
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});

  it("returns the fixture-backed API contract", async () => {
  const { server, baseUrl } = await startServer(async () => fixture);
  try {
  const { browser, page } = await launchPage(baseUrl);
    try {
      const response = await page.goto(`${baseUrl}/api/30min`, { waitUntil: "domcontentloaded" });
      const body = await response.json();
      expect(response.status()).to.equal(200);
      expect(Object.keys(body)).to.deep.equal(["title", "timeZone", "cal", "days"]);
      expect(body.timeZone).to.equal("Europe/Paris");
      expect(body.cal.id).to.equal("30min");
      expect(body.days).to.deep.equal(fixture.days);
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});

  it("reuses cached calendar data for five minutes when CACHE is enabled", async () => {
  const previousCache = process.env.CACHE;
  process.env.CACHE = "true";
  let scrapeCount = 0;
  const scraper = async () => {
    scrapeCount += 1;
    return { ...fixture, title: `Fixture ${scrapeCount}` };
  };
  const { server, baseUrl } = await startServer(scraper);
  try {
    const first = await fetch(`${baseUrl}/api/30min`);
    const second = await fetch(`${baseUrl}/api/30min`);
    expect((await first.json()).title).to.equal("Fixture 1");
    expect((await second.json()).title).to.equal("Fixture 1");
    expect(scrapeCount).to.equal(1);
  } finally {
    await closeServer(server);
    if (previousCache === undefined) delete process.env.CACHE;
    else process.env.CACHE = previousCache;
  }
});

  it("refreshes cached calendar data after five minutes", async () => {
  const previousCache = process.env.CACHE;
  const previousNow = Date.now;
  process.env.CACHE = "true";
  let currentTime = 0;
  Date.now = () => currentTime;
  let scrapeCount = 0;
  const { server, baseUrl } = await startServer(async () => {
    scrapeCount += 1;
    return { ...fixture, title: `Fixture ${scrapeCount}` };
  });
  try {
    await fetch(`${baseUrl}/api/30min`);
    currentTime = 5 * 60 * 1000;
    const response = await fetch(`${baseUrl}/api/30min`);
    expect((await response.json()).title).to.equal("Fixture 2");
    expect(scrapeCount).to.equal(2);
  } finally {
    await closeServer(server);
    Date.now = previousNow;
    if (previousCache === undefined) delete process.env.CACHE;
    else process.env.CACHE = previousCache;
  }
});

  it("does not cache calendar data when CACHE is disabled", async () => {
  const previousCache = process.env.CACHE;
  delete process.env.CACHE;
  let scrapeCount = 0;
  const { server, baseUrl } = await startServer(async () => {
    scrapeCount += 1;
    return fixture;
  });
  try {
    await fetch(`${baseUrl}/api/30min`);
    await fetch(`${baseUrl}/api/30min`);
    expect(scrapeCount).to.equal(2);
  } finally {
    await closeServer(server);
    if (previousCache === undefined) delete process.env.CACHE;
    else process.env.CACHE = previousCache;
  }
});

  (process.env.LIVE_CALENDAR_TESTS ? it : it.skip)("runs live calendar scraping when explicitly enabled", async () => {
  const { server, baseUrl } = await startServer();
  try {
  const { browser, page } = await launchPage(`${baseUrl}/30min`);
    try {
      await page.waitForSelector("#results.visible", { timeout: 180000 });
      const response = await page.goto(`${baseUrl}/api/30min`, { waitUntil: "domcontentloaded", timeout: 180000 });
      const body = await response.json();
      expect(response.status()).to.equal(200);
      expect(body.cal.id).to.equal("30min");
      expect(body.days).to.be.an("array");
      expect(body.days.every((day) => day.fullDate && Array.isArray(day.slots))).to.equal(true);
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});
});
