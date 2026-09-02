// ── Shared utility functions ──────────────────────────────────────────────────

const { t, intlLocale } = require("./i18n");

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

/**
 * Groups an array of day objects into ISO calendar weeks (Mon–Sun).
 *
 * @param  {Array}  days    - each day has slots[0].tsMs (Unix ms timestamp)
 * @param  {string} locale  - 'fr' | 'en'
 * @returns {Array<{label: string, days: Array}>}
 */
function groupByWeek(days, locale = "fr") {
  const weeks = new Map();
  const tag = intlLocale(locale);

  for (const day of days) {
    const ts = day.slots[0]?.tsMs;
    if (!ts) continue;

    const d = new Date(ts);
    const dow = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
    const mon = new Date(d);
    mon.setDate(d.getDate() - dow);
    mon.setHours(0, 0, 0, 0);

    const key = mon.toISOString();
    if (!weeks.has(key)) weeks.set(key, { monday: mon, days: [] });
    weeks.get(key).days.push(day);
  }

  const fmt = (d) =>
    d.toLocaleDateString(tag, { day: "numeric", month: "long" });

  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { monday, days }]) => {
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        label: t(locale, "cal.week", { from: fmt(monday), to: fmt(sunday) }),
        days,
      };
    });
}

module.exports = { sleep, escapeHtml, groupByWeek };
