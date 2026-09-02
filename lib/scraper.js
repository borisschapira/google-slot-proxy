// ── Puppeteer scraping logic ──────────────────────────────────────────────────

const puppeteer = require("puppeteer-core");
const { sleep } = require("./helpers");
const { MAX_EXTRA_WEEKS } = require("../config");

// ── Browserless connection ────────────────────────────────────────────────────
// Set BROWSERLESS_TOKEN in your environment variables.
// Sign up at https://browserless.io to get a token.

function getBrowserWSEndpoint() {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token)
    throw new Error(
      "BROWSERLESS_TOKEN environment variable is not set. " +
        "Sign up at https://browserless.io and set the token.",
    );
  return `wss://chrome.browserless.io?token=${token}`;
}

// ── Browser / page setup ──────────────────────────────────────────────────────

async function launchPage(url) {
  const browser = await puppeteer.connect({
    browserWSEndpoint: getBrowserWSEndpoint(),
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/124.0.0.0 Safari/537.36",
  );
  await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
  return { browser, page };
}

/**
 * Waits until the calendar SPA has fully hydrated at least one slot button.
 * Google Calendar renders DOM nodes early but populates aria-label and
 * data-date-time asynchronously — we poll for both to be present.
 */
async function waitForCalendar(page, timeoutMs = 20000) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector(
        '[role="listitem"] button[data-date-time]',
      );
      if (btn && btn.getAttribute("aria-label")?.trim()) return true;
      return Array.from(
        document.querySelectorAll('[role="list"][aria-label]'),
      ).some((el) => /\b20\d{2}\b/.test(el.getAttribute("aria-label")));
    },
    { polling: 300, timeout: timeoutMs },
  );
}

// ── In-browser extraction functions ──────────────────────────────────────────
// These run inside page.evaluate() — no class names, only ARIA / data-* attrs.

function extractCurrentView() {
  return Array.from(document.querySelectorAll('[role="list"][aria-label]'))
    .filter((el) => /\b20\d{2}\b/.test(el.getAttribute("aria-label")))
    .map((listEl) => ({
      fullDate: listEl.getAttribute("aria-label"),
      slots: Array.from(
        listEl.querySelectorAll(
          '[role="listitem"] button[data-date-time][aria-label]',
        ),
      )
        .map((btn) => ({
          label: btn.getAttribute("aria-label"),
          tsMs: parseInt(btn.getAttribute("data-date-time"), 10),
        }))
        .sort((a, b) => a.tsMs - b.tsMs),
    }))
    .filter((d) => d.slots.length > 0);
}

/**
 * Detects the "next day" navigation button label dynamically.
 * Avoids hardcoding locale-specific strings like "Jour suivant".
 * The next-day button is always the last non-date, non-time button in the DOM.
 */
function findNextDayButtonLabel() {
  const timePattern = /^\d{2}:\d{2}$/;
  const datePattern = /\b20\d{2}\b/;
  const candidates = Array.from(document.querySelectorAll("button[aria-label]"))
    .filter((btn) => {
      const l = btn.getAttribute("aria-label") || "";
      return (
        !timePattern.test(l) && !datePattern.test(l) && l.trim().length > 0
      );
    })
    .map((btn) => btn.getAttribute("aria-label"));
  return candidates[candidates.length - 1] ?? null;
}

// ── Public scraping API ───────────────────────────────────────────────────────

/**
 * Scrapes all available slots for a given calendar URL,
 * navigating up to MAX_EXTRA_WEEKS weeks beyond the initial view.
 *
 * @param  {string} url  - Google Calendar appointment schedule URL
 * @returns {Promise<{title: string, days: Array}>}
 */
async function scrapeCalendar(url) {
  const { browser, page } = await launchPage(url);
  try {
    await waitForCalendar(page);

    const collectedDays = new Map(); // fullDate → day object (deduped)
    const title = await page.title();
    const nextDayLabel = await page.evaluate(findNextDayButtonLabel);

    if (!nextDayLabel)
      throw new Error("Navigation button not found on the page.");

    async function harvest() {
      const days = await page.evaluate(extractCurrentView);
      let added = 0;
      for (const day of days) {
        if (!collectedDays.has(day.fullDate)) {
          collectedDays.set(day.fullDate, day);
          added++;
        }
      }
      return added;
    }

    // Harvest initial (current) week
    await harvest();

    // Advance week by week and harvest
    for (let week = 1; week <= MAX_EXTRA_WEEKS; week++) {
      for (let d = 0; d < 7; d++) {
        try {
          await page.click(`button[aria-label="${nextDayLabel}"]`);
          await sleep(120);
        } catch {
          break;
        }
      }
      try {
        await waitForCalendar(page, 10000);
      } catch {
        continue;
      }
      await harvest();
    }

    const days = [...collectedDays.values()].sort(
      (a, b) => (a.slots[0]?.tsMs ?? 0) - (b.slots[0]?.tsMs ?? 0),
    );

    return { title, days };
  } finally {
    await browser.close();
  }
}

/**
 * Opens the page and returns raw diagnostic data without navigating.
 * Used by the /debug routes.
 */
async function scrapeDebugInfo(url) {
  const { browser, page } = await launchPage(url);
  try {
    await waitForCalendar(page, 12000).catch(() => {});
    const report = await page.evaluate(() => {
      const timePattern = /^\d{2}:\d{2}$/;
      const datePattern = /\b20\d{2}\b/;
      return {
        pageTitle: document.title,
        pageUrl: location.href,
        allRoleLists: Array.from(
          document.querySelectorAll('[role="list"][aria-label]'),
        ).map((el) => ({
          ariaLabel: el.getAttribute("aria-label"),
          hasYearMatch: datePattern.test(el.getAttribute("aria-label")),
          slotButtons: el.querySelectorAll(
            '[role="listitem"] button[data-date-time]',
          ).length,
        })),
        allSlotButtons: Array.from(
          document.querySelectorAll(
            '[role="listitem"] button[data-date-time][aria-label]',
          ),
        ).map((btn) => ({
          ariaLabel: btn.getAttribute("aria-label"),
          dataDateTime: btn.getAttribute("data-date-time"),
        })),
        navButtons: Array.from(document.querySelectorAll("button[aria-label]"))
          .map((b) => b.getAttribute("aria-label"))
          .filter((l) => l && !timePattern.test(l) && !datePattern.test(l)),
      };
    });
    return report;
  } finally {
    await browser.close();
  }
}

/**
 * Returns a PNG screenshot Buffer of the rendered page.
 */
async function screenshotPage(url) {
  const { browser, page } = await launchPage(url);
  try {
    await waitForCalendar(page, 12000).catch(() => {});
    return await page.screenshot({ fullPage: true });
  } finally {
    await browser.close();
  }
}

/**
 * Returns the full raw HTML of the rendered page.
 */
async function rawHtmlPage(url) {
  const { browser, page } = await launchPage(url);
  try {
    await waitForCalendar(page, 12000).catch(() => {});
    return await page.content();
  } finally {
    await browser.close();
  }
}

module.exports = {
  scrapeCalendar,
  scrapeDebugInfo,
  screenshotPage,
  rawHtmlPage,
};
