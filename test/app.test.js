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
      expect(await page.$eval("#update-banner", (banner) => banner.hidden)).to.equal(false);
      expect(await page.$eval("#update-banner a", (link) => link.getAttribute("href"))).to.equal("/api/30min?refresh=1");
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

  it("keeps the loading indicator and retries after a rate limit", async () => {
  let scrapeCount = 0;
  const scraper = async () => {
    scrapeCount += 1;
    throw new Error("Unexpected server response: 429");
  };
  const { server, baseUrl } = await startServer(scraper);
  try {
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
      await page.setExtraHTTPHeaders({ "Accept-Language": "fr-FR" });
      await page.evaluateOnNewDocument(() => {
        const originalSetTimeout = window.setTimeout;
        window.setTimeout = function (callback, delay, ...args) {
          if (delay === 120000) {
            window.__retryDelay = delay;
            window.__retryCallback = callback;
            return 0;
          }
          return originalSetTimeout.call(this, callback, delay, ...args);
        };
      });

      const firstResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/30min"),
      );
      await page.goto(`${baseUrl}/30min?lang=fr`, { waitUntil: "domcontentloaded" });
      const firstResponse = await firstResponsePromise;
      expect(firstResponse.status()).to.equal(429);
      expect(firstResponse.headers()["retry-after"]).to.equal("120");
      await page.waitForFunction(() => window.__retryDelay === 120000);
      expect(await page.$eval("#loading", (loading) => getComputedStyle(loading).display)).to.equal("flex");
      expect(await page.$eval("#loading", (loading) => loading.getAttribute("aria-busy"))).to.equal("true");
      expect(await page.$eval(".loading-title", (heading) => heading.textContent)).to.include("2 minutes");
      expect(await page.$eval("#error-box", (error) => getComputedStyle(error).display)).to.equal("none");

      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.evaluate(() => window.__retryCallback()),
      ]);
      const retryResponse = await page.waitForResponse((response) =>
        response.url().includes("/api/30min"),
      );
      expect(retryResponse.status()).to.equal(429);
      await page.waitForFunction(() => window.__retryDelay === 120000);
      expect(scrapeCount).to.equal(2);
      expect(page.url()).to.include("lang=fr");
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});

  it("refreshes calendar data in place when the update link is clicked", async () => {
  let scrapeCount = 0;
  const scraper = async () => {
    scrapeCount += 1;
    return { ...fixture, days: scrapeCount === 1 ? fixture.days : [] };
  };
  const { server, baseUrl } = await startServer(scraper);
  try {
    const { browser, page } = await launchPage(`${baseUrl}/30min`);
    try {
      await page.waitForSelector("#results.visible");
      await Promise.all([
        page.waitForResponse((response) => response.url().includes("/api/30min?refresh=1")),
        page.click("#refresh-calendar"),
      ]);
      await page.waitForSelector("#results .empty");
      expect(scrapeCount).to.equal(2);
      expect(await page.$eval("#refresh-calendar", (link) => link.textContent)).to.equal("Refresh now");
      expect(await page.$eval("#update-banner span", (label) => label.textContent)).to.include("Updated on");
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
      expect(Object.keys(body)).to.deep.equal(["title", "timeZone", "cal", "days", "updatedAt"]);
      expect(body.timeZone).to.equal("Europe/Paris");
      expect(body.cal.id).to.equal("30min");
      expect(body.days).to.deep.equal(fixture.days);
      expect(new Date(body.updatedAt).toISOString()).to.equal(body.updatedAt);
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});

  it("reuses cached calendar data for 15 minutes when CACHE is enabled", async () => {
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
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.title).to.equal("Fixture 1");
    expect(secondBody.title).to.equal("Fixture 1");
    expect(secondBody.updatedAt).to.equal(firstBody.updatedAt);
    expect(scrapeCount).to.equal(1);
  } finally {
    await closeServer(server);
    if (previousCache === undefined) delete process.env.CACHE;
    else process.env.CACHE = previousCache;
  }
});

  it("shares one scrape between concurrent requests when the cache is empty", async () => {
  const previousCache = process.env.CACHE;
  delete process.env.CACHE;
  let scrapeCount = 0;
  let finishScrape;
  let startScrape;
  const scrapeStarted = new Promise((resolve) => { startScrape = resolve; });
  const scraper = async () => {
    scrapeCount += 1;
    startScrape();
    return new Promise((resolve) => {
      finishScrape = () => resolve(fixture);
    });
  };
  const { server, baseUrl } = await startServer(scraper);
  try {
    const firstRequest = fetch(`${baseUrl}/api/30min`);
    await scrapeStarted;
    const secondRequest = fetch(`${baseUrl}/api/30min`);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(scrapeCount).to.equal(1);

    finishScrape();
    const [firstResponse, secondResponse] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);
    const [firstBody, secondBody] = await Promise.all([
      firstResponse.json(),
      secondResponse.json(),
    ]);
    expect(firstResponse.status).to.equal(200);
    expect(secondResponse.status).to.equal(200);
    expect(firstBody.updatedAt).to.equal(secondBody.updatedAt);
    expect(scrapeCount).to.equal(1);
  } finally {
    await closeServer(server);
    if (previousCache === undefined) delete process.env.CACHE;
    else process.env.CACHE = previousCache;
  }
});

  it("serves the existing cache with its timestamp during a forced refresh", async () => {
  const previousCache = process.env.CACHE;
  process.env.CACHE = "true";
  let scrapeCount = 0;
  let startRefresh;
  let finishRefresh;
  const refreshStarted = new Promise((resolve) => { startRefresh = resolve; });
  const scraper = async () => {
    scrapeCount += 1;
    if (scrapeCount === 1) return fixture;
    startRefresh();
    return new Promise((resolve) => {
      finishRefresh = () => resolve({ ...fixture, title: "Refreshed fixture" });
    });
  };
  const { server, baseUrl } = await startServer(scraper);
  try {
    const initialResponse = await fetch(`${baseUrl}/api/30min`);
    const initialBody = await initialResponse.json();
    const refreshRequest = fetch(`${baseUrl}/api/30min?refresh=1`);
    await refreshStarted;

    const concurrentResponse = await fetch(`${baseUrl}/api/30min`);
    const concurrentBody = await concurrentResponse.json();
    expect(concurrentResponse.status).to.equal(200);
    expect(concurrentBody.title).to.equal(fixture.title);
    expect(concurrentBody.updatedAt).to.equal(initialBody.updatedAt);
    expect(new Date(concurrentBody.updatedAt).toString()).to.not.equal("Invalid Date");
    expect(scrapeCount).to.equal(2);

    finishRefresh();
    const refreshedResponse = await refreshRequest;
    const refreshedBody = await refreshedResponse.json();
    expect(refreshedBody.title).to.equal("Refreshed fixture");
    expect(new Date(refreshedBody.updatedAt).toString()).to.not.equal("Invalid Date");
  } finally {
    await closeServer(server);
    if (previousCache === undefined) delete process.env.CACHE;
    else process.env.CACHE = previousCache;
  }
});

  it("does not display an invalid update date when the API timestamp is missing", async () => {
  const { server, baseUrl } = await startServer(async () => fixture);
  try {
    const { browser, page } = await launchPage(baseUrl);
    try {
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.url().includes("/api/30min")) {
          request.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ...fixture,
              timeZone: "Europe/Paris",
              cal: {
                id: "30min",
                label: CALENDAR_MAP["30min"].label,
                emoji: CALENDAR_MAP["30min"].emoji,
                originalUrl: CALENDAR_MAP["30min"].originalUrl,
                description: CALENDAR_MAP["30min"].description,
              },
            }),
          });
        } else {
          request.continue();
        }
      });

      await page.goto(`${baseUrl}/30min`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#results.visible");
      expect(await page.$eval("#update-banner", (banner) => banner.textContent)).to.not.include("Invalid Date");
      expect(await page.$("#refresh-calendar")).to.not.equal(null);
    } finally {
      await browser.close();
    }
  } finally {
    await closeServer(server);
  }
});

  it("refreshes cached calendar data after 15 minutes", async () => {
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
    currentTime = 15 * 60 * 1000 - 1;
    const cachedResponse = await fetch(`${baseUrl}/api/30min`);
    expect((await cachedResponse.json()).title).to.equal("Fixture 1");
    expect(scrapeCount).to.equal(1);
    currentTime = 15 * 60 * 1000;
    const refreshedResponse = await fetch(`${baseUrl}/api/30min`);
    expect((await refreshedResponse.json()).title).to.equal("Fixture 2");
    expect(scrapeCount).to.equal(2);
  } finally {
    await closeServer(server);
    Date.now = previousNow;
    if (previousCache === undefined) delete process.env.CACHE;
    else process.env.CACHE = previousCache;
  }
});

  it("forces a scrape and replaces cached calendar data when refresh=1", async () => {
  const previousCache = process.env.CACHE;
  process.env.CACHE = "true";
  let scrapeCount = 0;
  const { server, baseUrl } = await startServer(async () => {
    scrapeCount += 1;
    return { ...fixture, title: `Fixture ${scrapeCount}` };
  });
  try {
    await fetch(`${baseUrl}/api/30min`);
    const forcedResponse = await fetch(`${baseUrl}/api/30min?refresh=1`);
    const cachedResponse = await fetch(`${baseUrl}/api/30min`);
    expect((await forcedResponse.json()).title).to.equal("Fixture 2");
    expect((await cachedResponse.json()).title).to.equal("Fixture 2");
    expect(scrapeCount).to.equal(2);
  } finally {
    await closeServer(server);
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
