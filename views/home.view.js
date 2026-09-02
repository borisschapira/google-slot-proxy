// ── Homepage view ─────────────────────────────────────────────────────────────

const { shell } = require("./shell");
const { escapeHtml } = require("../lib/helpers");
const { t } = require("../lib/i18n");

/**
 * @param {Array}  calendars
 * @param {string} locale     - 'fr' | 'en'
 */
function renderHome(calendars, locale = "fr") {
  const cards = calendars
    .map(
      (cal) => `
        <div class="cal-card">
            <div class="cal-emoji">${cal.emoji}</div>
            <div class="cal-body">
                <h2 class="cal-title">${escapeHtml(cal.label)}</h2>
                <p class="cal-desc">${escapeHtml(cal.description[locale] ?? cal.description.en)}</p>
                <div class="cal-actions">
                    <a class="btn btn-primary" href="/${cal.id}">
                        ${t(locale, "home.btn.slots")}
                    </a>
                    <a class="btn btn-secondary"
                       href="${escapeHtml(cal.originalUrl)}"
                       target="_blank" rel="noopener">
                        ${t(locale, "home.btn.gcal")}
                    </a>
                </div>
            </div>
        </div>`,
    )
    .join("");

  return shell({
    locale,
    title: t(locale, "home.title"),
    bodyContent: `
        <div class="page-header">
            <h1>${t(locale, "home.h1")}</h1>
            <p>${escapeHtml(t(locale, "home.intro"))}</p>
        </div>

        <div class="notice">
            <strong>${escapeHtml(t(locale, "home.proxy.strong"))}</strong>
            ${escapeHtml(t(locale, "home.proxy.body"))}
        </div>

        <div class="cal-list">${cards}</div>

        <style>
            .cal-list { display: flex; flex-direction: column; gap: 16px; }
            .cal-card {
                background: #fff;
                border-radius: 14px;
                box-shadow: 0 1px 6px rgba(0,0,0,0.10);
                padding: 20px 24px;
                display: flex;
                gap: 20px;
                align-items: flex-start;
            }
            .cal-emoji { font-size: 2rem; flex-shrink: 0; line-height: 1; padding-top: 2px; }
            .cal-body  { flex: 1; }
            .cal-title { font-size: 1.1rem; font-weight: 600; color: #202124; margin-bottom: 4px; }
            .cal-desc  { font-size: 0.88rem; color: #666; line-height: 1.5; margin-bottom: 14px; }
            .cal-actions { display: flex; flex-wrap: wrap; gap: 10px; }
            .btn {
                display: inline-block;
                padding: 8px 18px;
                border-radius: 8px;
                font-size: 0.85rem;
                font-weight: 500;
            }
            .btn-primary { background: #1a73e8; color: #fff; }
            .btn-primary:hover { background: #1558b0; text-decoration: none; }
            .btn-secondary { background: #f1f3f4; color: #444; border: 1px solid #dde3ea; }
            .btn-secondary:hover { background: #e4e7ea; text-decoration: none; }
            @media (max-width: 480px) { .cal-card { flex-direction: column; gap: 12px; } }
        </style>`,
  });
}

module.exports = { renderHome };
