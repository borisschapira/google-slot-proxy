// ── Puppeteer scraping logic ──────────────────────────────────────────────────

const puppeteer = require("puppeteer");
const { sleep } = require("./helpers");
const {
  MAX_EXTRA_WEEKS,
  MAX_LOOKAHEAD_DAYS,
  CALENDAR_TIME_ZONE,
} = require("../config");

const calendarDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getCalendarDateKey(timestampMs) {
  const parts = Object.fromEntries(
    calendarDateFormatter
      .formatToParts(new Date(timestampMs))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// ── Browser launch ─────────────────────────────────────────────────────────────

function getBrowserWSEndpoint() {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token)
    throw new Error(
      "BROWSERLESS_TOKEN environment variable is not set. " +
        "Sign up at https://browserless.io and set the token.",
    );
  return `wss://chrome.browserless.io?token=${token}`;
}

function launchBrowser() {
  if (process.env.NODE_ENV === "development") {
    return puppeteer.launch({ headless: true });
  }
  return puppeteer.connect({
    browserWSEndpoint: getBrowserWSEndpoint(),
  });
}

// ── Browser / page setup ──────────────────────────────────────────────────────

async function launchPage(url) {
  const browser = await launchBrowser();
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
 * Waits for the calendar view to appear and remain unchanged while it loads.
 */
function readCalendarState() {
  const lists = Array.from(
    document.querySelectorAll('[role="list"][aria-label]'),
  );
  return {
    signature: JSON.stringify(
      lists.map((list) => ({
        date: list.getAttribute("aria-label"),
        slots: Array.from(
          list.querySelectorAll(
            '[role="listitem"] button[data-date-time][aria-label]',
          ),
        ).map((button) => [
          button.getAttribute("aria-label"),
          button.getAttribute("data-date-time"),
        ]),
      })),
    ),
    hasCalendar: lists.some((list) =>
      /\b20\d{2}\b/.test(list.getAttribute("aria-label")),
    ),
  };
}

async function waitForCalendar(page, timeoutMs = 20000, previousSignature) {
  const startedAt = Date.now();
  let lastSignature;
  let stableSince;

  while (Date.now() - startedAt < timeoutMs) {
    const state = await page.evaluate(readCalendarState);
    if (
      state.hasCalendar &&
      state.signature !== previousSignature &&
      state.signature === lastSignature
    ) {
      if (Date.now() - stableSince >= 300) return state.signature;
    } else if (
      state.hasCalendar &&
      state.signature !== previousSignature
    ) {
      lastSignature = state.signature;
      stableSince = Date.now();
    }
    await sleep(100);
  }

  throw new Error(
    previousSignature
      ? "Calendar view did not update after navigation."
      : "Calendar did not finish loading.",
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
 * Detects the next-view navigation button label dynamically.
 * Avoids hardcoding locale-specific strings like "Jour suivant".
 * The navigation button is the last non-date, non-time button in the DOM.
 */
function findNextViewButtonLabel() {
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
 * navigating weekly views far enough to cover MAX_LOOKAHEAD_DAYS.
 *
 * @param  {string} url  - Google Calendar appointment schedule URL
 * @returns {Promise<{title: string, days: Array}>}
 */
async function scrapeCalendar(url) {
  const latestCalendarDate = addDaysToDateKey(
    getCalendarDateKey(Date.now()),
    MAX_LOOKAHEAD_DAYS,
  );
  const { browser, page } = await launchPage(url);
  try {
    await waitForCalendar(page);

    const collectedDays = new Map(); // fullDate → day object (deduped)
    const title = await page.title();
    const nextViewLabel = await page.evaluate(findNextViewButtonLabel);

    if (!nextViewLabel)
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

    // The page exposes one week of dates at a time; one click advances one week.
    await harvest();

    for (let week = 1; week <= MAX_EXTRA_WEEKS; week++) {
      const before = await page.evaluate(readCalendarState);
      await page.click(`button[aria-label="${nextViewLabel}"]`);
      await waitForCalendar(page, 10000, before.signature);
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 });
      await harvest();
    }

    const days = [...collectedDays.values()]
      .map((day) => ({
        ...day,
        slots: day.slots.filter(
          (slot) => getCalendarDateKey(slot.tsMs) <= latestCalendarDate,
        ),
      }))
      .filter((day) => day.slots.length > 0)
      .sort((a, b) => a.slots[0].tsMs - b.slots[0].tsMs);

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
