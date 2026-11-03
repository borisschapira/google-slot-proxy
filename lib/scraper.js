// ── Puppeteer scraping logic ──────────────────────────────────────────────────

const puppeteer = require("puppeteer");
const { sleep } = require("./helpers");
const { MAX_LOOKAHEAD_DAYS, CALENDAR_TIME_ZONE } = require("../config");

const calendarDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

let browserQueue = Promise.resolve();

async function acquireBrowserSlot() {
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const previous = browserQueue;
  browserQueue = current;
  await previous;
  return release;
}

async function closeBrowserSession(browser, release) {
  try {
    await browser.close();
  } finally {
    release();
  }
}

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
  const release = await acquireBrowserSlot();
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36",
    );
    await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
    return { browser, page, release };
  } catch (error) {
    if (browser) await closeBrowserSession(browser, release);
    else release();
    throw error;
  }
}

/**
 * Waits for the calendar view to appear and remain unchanged while it loads.
 */
function readCalendarState() {
  const lists = Array.from(
    document.querySelectorAll('[role="list"][aria-label]'),
  );
  const locale = document.documentElement.lang || navigator.language || "en-US";
  const normalize = (value) =>
    value
      .toLocaleLowerCase(locale)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "long" });
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    normalize(monthFormatter.format(new Date(2026, month, 15))),
  );
  const dates = lists
    .map((list) => {
      const label = normalize(list.getAttribute("aria-label") || "");
      const month = monthNames.findIndex((name) =>
        label.split(" ").includes(name),
      );
      const numbers = Array.from(label.matchAll(/\d+/g), ([number]) =>
        Number(number),
      );
      const year = numbers.find((number) => number >= 1000 && number <= 9999);
      const day = numbers.find((number) => number >= 1 && number <= 31);
      if (month < 0 || !year || !day) return null;

      const date = new Date(year, month, day, 12);
      return date.getFullYear() === year &&
        date.getMonth() === month &&
        date.getDate() === day
        ? date
        : null;
    })
    .filter(Boolean);
  const dateParts = dates.length
    ? new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(
          dates.reduce((latest, date) =>
            date > latest ? date : latest,
          ),
        )
        .reduce((parts, { type, value }) => {
          parts[type] = value;
          return parts;
        }, {})
    : null;
  const latestDate = dateParts
    ? `${dateParts.year}-${dateParts.month}-${dateParts.day}`
    : null;

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
    latestDate,
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
      if (Date.now() - stableSince >= 300) return state;
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

function findNextWeekDateButtonLabel(latestDate) {
  if (!latestDate) return null;
  const [year, month, day] = latestDate.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day, 12);
  nextDate.setDate(nextDate.getDate() + 1);
  const locale = document.documentElement.lang || navigator.language || "en-US";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
      .formatToParts(nextDate)
      .map(({ type, value }) => [type, value]),
  );
  const normalize = (value) =>
    value
      .toLocaleLowerCase(locale)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    normalize(
      new Intl.DateTimeFormat(locale, {
        month: "long",
      }).format(new Date(2026, month, 15)),
    ),
  );
  const targetDay = normalize(parts.day);
  const targetWeekday = normalize(parts.weekday);
  const targetMonth = normalize(parts.month);
  const currentMonth = normalize(
    new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(year, month - 1, day, 12),
    ),
  );

  const matches = Array.from(
    document.querySelectorAll("button[aria-label]"),
  ).filter((button) => {
    const label = normalize(button.getAttribute("aria-label") || "");
    const hasDay = label.split(" ").includes(targetDay);
    const hasWeekday = label.includes(targetWeekday);
    const labelMonth = monthNames.find((month) =>
      label.split(" ").includes(month),
    );

    return (
      hasDay &&
      hasWeekday &&
      (targetMonth === currentMonth
        ? !labelMonth || labelMonth === targetMonth
        : labelMonth === targetMonth)
    );
  });

  return matches.length === 1
    ? matches[0].getAttribute("aria-label")
    : null;
}

function findNextMonthButtonLabel() {
  const normalize = (value) =>
    value
      .toLocaleLowerCase(document.documentElement.lang || navigator.language)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const matches = Array.from(
    document.querySelectorAll("button[aria-label]"),
  ).filter((button) => {
    const words = normalize(button.getAttribute("aria-label") || "").split(" ");
    return (
      (words.includes("next") && words.includes("month")) ||
      (words.includes("mois") && words.includes("suivant"))
    );
  });

  return matches.length === 1
    ? matches[0].getAttribute("aria-label")
    : null;
}

function clickCalendarButton(label) {
  const button = Array.from(
    document.querySelectorAll("button[aria-label]"),
  ).find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!button)
    throw new Error("Calendar navigation button disappeared before navigation.");
  if (button.disabled || button.getAttribute("aria-disabled") === "true")
    throw new Error("Calendar navigation button is disabled.");
  button.click();
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
  const { browser, page, release } = await launchPage(url);
  try {
    let view = await waitForCalendar(page);
    if (!view.latestDate)
      throw new Error("Calendar dates could not be read from the page.");

    const collectedDays = new Map(); // fullDate → day object (deduped)
    const title = await page.title();

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

    // Select the first day after the visible week instead of the adjacent-day arrow.
    await harvest();

    while (view.latestDate < latestCalendarDate) {
      let nextDateLabel = await page.evaluate(
        findNextWeekDateButtonLabel,
        view.latestDate,
      );
      if (!nextDateLabel) {
        const nextMonthLabel = await page.evaluate(findNextMonthButtonLabel);
        if (!nextMonthLabel)
          throw new Error("Next calendar week date not found on the page.");

        await page.evaluate(clickCalendarButton, nextMonthLabel);
        const startedAt = Date.now();
        while (!nextDateLabel && Date.now() - startedAt < 10000) {
          await sleep(100);
          nextDateLabel = await page.evaluate(
            findNextWeekDateButtonLabel,
            view.latestDate,
          );
        }
        if (!nextDateLabel)
          throw new Error("Next calendar week date did not appear after month navigation.");
      }

      await page.evaluate(clickCalendarButton, nextDateLabel);
      const nextView = await waitForCalendar(page, 10000, view.signature);
      if (!nextView.latestDate || nextView.latestDate <= view.latestDate)
        throw new Error("Calendar navigation did not advance to a later date.");

      await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 });
      await harvest();
      view = nextView;
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
    await closeBrowserSession(browser, release);
  }
}

/**
 * Opens the page and returns raw diagnostic data without navigating.
 * Used by the /debug routes.
 */
async function scrapeDebugInfo(url) {
  const { browser, page, release } = await launchPage(url);
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
    await closeBrowserSession(browser, release);
  }
}

/**
 * Returns a PNG screenshot Buffer of the rendered page.
 */
async function screenshotPage(url) {
  const { browser, page, release } = await launchPage(url);
  try {
    await waitForCalendar(page, 12000).catch(() => {});
    return await page.screenshot({ fullPage: true });
  } finally {
    await closeBrowserSession(browser, release);
  }
}

/**
 * Returns the full raw HTML of the rendered page.
 */
async function rawHtmlPage(url) {
  const { browser, page, release } = await launchPage(url);
  try {
    await waitForCalendar(page, 12000).catch(() => {});
    return await page.content();
  } finally {
    await closeBrowserSession(browser, release);
  }
}

module.exports = {
  scrapeCalendar,
  scrapeDebugInfo,
  screenshotPage,
  rawHtmlPage,
};
