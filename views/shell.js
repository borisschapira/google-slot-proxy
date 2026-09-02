// ── Shared HTML shell ─────────────────────────────────────────────────────────

const { escapeHtml } = require("../lib/helpers");
const { t, intlLocale } = require("../lib/i18n");

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.bodyContent
 * @param {string} opts.locale      - 'fr' | 'en'
 */
function shell({ title, bodyContent, locale = "fr" }) {
  const lang = t(locale, "shell.lang");
  const updatedLabel = t(locale, "shell.updatedAt");
  const dateStr = new Date().toLocaleString(intlLocale(locale));

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f0f4f9;
            color: #202124;
            padding: 32px 16px;
            min-height: 100vh;
        }

        a { color: #1a73e8; text-decoration: none; }
        a:hover { text-decoration: underline; }

        .container { max-width: 860px; margin: 0 auto; }

        .page-header { margin-bottom: 28px; }
        .page-header h1 { font-size: 1.6rem; font-weight: 700; color: #1a73e8; }
        .page-header p { margin-top: 8px; color: #555; line-height: 1.6; max-width: 620px; }

        .back {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.85rem;
            color: #1a73e8;
            margin-bottom: 20px;
        }
        .back::before { content: "←"; }

        .notice {
            background: #fff8e1;
            border-left: 4px solid #f9a825;
            border-radius: 6px;
            padding: 12px 16px;
            font-size: 0.85rem;
            color: #555;
            line-height: 1.5;
            margin-bottom: 28px;
        }
        .notice strong { color: #202124; }

        .footer {
            margin-top: 32px;
            font-size: 0.75rem;
            color: #aaa;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        ${bodyContent}
        <p class="footer">${escapeHtml(updatedLabel)} ${escapeHtml(dateStr)}</p>
    </div>
</body>
</html>`;
}

module.exports = { shell };
