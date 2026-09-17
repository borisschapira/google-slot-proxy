// ── Shared utility functions ──────────────────────────────────────────────────

const { t, intlLocale } = require("./i18n");
const { CALENDAR_TIME_ZONE } = require("../config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSlotTime(tsMs, locale = "fr", timeZone = CALENDAR_TIME_ZONE) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: locale === "fr" ? "h23" : undefined,
  }).format(new Date(tsMs));
}

function formatSlotDate(tsMs, locale = "fr", timeZone = CALENDAR_TIME_ZONE) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(tsMs));
}

/**
 * Groups an array of day objects into ISO calendar weeks (Mon–Sun).
 *
 * @param  {Array}  days    - each day has slots[0].tsMs (Unix ms timestamp)
 * @param  {string} locale  - 'fr' | 'en'
 * @returns {Array<{label: string, days: Array}>}
 */
function groupByWeek(days, locale = "fr", timeZone = CALENDAR_TIME_ZONE) {
  const weeks = new Map();
  const tag = intlLocale(locale);

  for (const day of days) {
    const ts = day.slots[0]?.tsMs;
    if (!ts) continue;

    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ts));
    const d = new Date(`${date}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - dow);

    const key = mon.toISOString();
    if (!weeks.has(key)) weeks.set(key, { monday: mon, days: [] });
    weeks.get(key).days.push(day);
  }

  const fmt = (d) =>
    d.toLocaleDateString(tag, {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });

  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { monday, days }]) => {
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return {
        label: t(locale, "cal.week", { from: fmt(monday), to: fmt(sunday) }),
        days,
      };
    });
}

module.exports = {
  sleep,
  escapeHtml,
  formatSlotTime,
  formatSlotDate,
  groupByWeek,
};
