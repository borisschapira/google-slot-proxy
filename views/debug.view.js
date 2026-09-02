// ── Debug views ───────────────────────────────────────────────────────────────

const { shell } = require("./shell");
const { escapeHtml } = require("../lib/helpers");
const { t } = require("../lib/i18n");

/**
 * @param {Array}  calendars
 * @param {string} locale
 */
function renderDebugIndex(calendars, locale = "fr") {
  const items = calendars
    .map(
      (c) => `
        <li class="debug-item">
            <strong>${c.emoji} ${escapeHtml(c.label)}</strong>
            <span class="debug-links">
                <a href="/debug/${c.id}">${t(locale, "debug.json")}</a>
                <a href="/debug/${c.id}?shot=1">${t(locale, "debug.screenshot")}</a>
                <a href="/debug/${c.id}?html=1">${t(locale, "debug.html")}</a>
            </span>
        </li>`,
    )
    .join("");

  return shell({
    locale,
    title: t(locale, "debug.title"),
    bodyContent: `
        <a class="back" href="/">${t(locale, "nav.back")}</a>

        <div class="page-header">
            <h1>${t(locale, "debug.h1")}</h1>
            <p>${escapeHtml(t(locale, "debug.intro"))}</p>
        </div>

        <ul class="debug-list">${items}</ul>

        <style>
            .debug-list { list-style: none; display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
            .debug-item {
                background: #fff; border-radius: 10px; padding: 14px 18px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                display: flex; justify-content: space-between; align-items: center;
                flex-wrap: wrap; gap: 10px;
            }
            .debug-links { display: flex; gap: 14px; font-size: 0.85rem; }
        </style>`,
  });
}

/**
 * @param {string} calId
 * @param {Error}  err
 * @param {string} locale
 */
function renderDebugError(calId, err, locale = "fr") {
  return shell({
    locale,
    title: t(locale, "error.title"),
    bodyContent: `
        <a class="back" href="/debug">${t(locale, "nav.backDebug")}</a>

        <div class="page-header">
            <h1>${t(locale, "error.title")} — ${escapeHtml(calId)}</h1>
            <p>${escapeHtml(err.message)}</p>
        </div>

        <pre style="background:#f1f3f4;padding:16px;border-radius:8px;font-size:0.8rem;overflow:auto;">
${escapeHtml(err.stack ?? "")}</pre>`,
  });
}

module.exports = { renderDebugIndex, renderDebugError };
