// ── Loading / interstitial view ───────────────────────────────────────────────
// Returned immediately by GET /:calId.
// Embeds window.I18N so the client-side fetch+render uses the same locale.

const { escapeHtml } = require('../lib/helpers');
const { t, TRANSLATIONS, PLURAL, INTL_LOCALE } = require('../lib/i18n');

/**
 * @param {object} cal     - calendar config entry
 * @param {string} locale  - 'fr' | 'en'
 */
function renderLoading(cal, locale = 'fr') {
    // Serialize only what the client needs (avoid leaking server internals)
    const clientI18N = {
        locale,
        intlLocale: INTL_LOCALE[locale] ?? 'en-US',
        // Inline plural function bodies as strings so they can be eval'd client-side
        pluralDefs: {
            days:       PLURAL[locale].days.toString(),
            slots:      PLURAL[locale].slots.toString(),
            totalSlots: PLURAL[locale].totalSlots.toString(),
        },
        strings: {
            back:               t(locale, 'nav.back'),
            calH1prefix:        t(locale, 'cal.h1prefix'),
            noticeStrong:       t(locale, 'cal.notice.strong'),
            noticeBook:         t(locale, 'cal.notice.book'),
            noticeLink:         t(locale, 'cal.notice.link'),
            noticeConfirm:      t(locale, 'cal.notice.confirm'),
            weekTemplate:       TRANSLATIONS[locale]['cal.week'] ?? TRANSLATIONS.en['cal.week'],
            empty:              t(locale, 'cal.empty'),
            updatedAt:          t(locale, 'shell.updatedAt'),
            errorTitle:         t(locale, 'error.title'),
            errorDiagnose:      t(locale, 'error.diagnose'),
        },
    };

    return `<!DOCTYPE html>
<html lang="${t(locale, 'shell.lang')}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(t(locale, 'loading.pageTitle'))} — ${escapeHtml(cal.label)}</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f0f4f9; color: #202124;
            padding: 32px 16px; min-height: 100vh;
        }
        a { color: #1a73e8; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .container { max-width: 860px; margin: 0 auto; }

        /* Loading state */
        #loading {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; min-height: 60vh; gap: 24px; text-align: center;
        }
        .spinner {
            width: 48px; height: 48px;
            border: 4px solid #d2e3fc; border-top-color: #1a73e8;
            border-radius: 50%; animation: spin 0.9s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-title { font-size: 1.2rem; font-weight: 600; color: #1a73e8; }
        .loading-sub { font-size: 0.88rem; color: #888; max-width: 340px; line-height: 1.5; }

        /* Results */
        #results { display: none; }
        #results.visible { display: block; animation: fadeIn 0.35s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; } }

        /* Error */
        #error-box {
            display: none; background: #fce8e6; border-left: 4px solid #d93025;
            border-radius: 6px; padding: 16px 20px; margin-top: 24px;
            font-size: 0.9rem; color: #c5221f; line-height: 1.5;
        }
        #error-box.visible { display: block; }

        /* Shared result styles */
        .back { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; margin-bottom: 20px; }
        .back::before { content: "←"; }
        .page-header { margin-bottom: 28px; }
        .page-header h1 { font-size: 1.6rem; font-weight: 700; color: #1a73e8; }
        .page-header p { margin-top: 8px; color: #555; line-height: 1.6; max-width: 620px; }
        .notice {
            background: #fff8e1; border-left: 4px solid #f9a825;
            border-radius: 6px; padding: 12px 16px;
            font-size: 0.85rem; color: #555; line-height: 1.5; margin-bottom: 28px;
        }
        .notice strong { color: #202124; }
        .summary { font-size: 0.85rem; color: #888; margin-bottom: 20px; }
        .week { margin-bottom: 32px; }
        .week-label {
            font-size: 0.78rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.06em; color: #999; margin-bottom: 12px;
            border-bottom: 1px solid #dde3ea; padding-bottom: 6px;
        }
        .day-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
        .day-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.10); overflow: hidden; }
        .day-header {
            background: #1a73e8; color: #fff; padding: 9px 14px;
            display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
        }
        .day-name  { font-weight: 600; font-size: 0.85rem; }
        .slot-count { font-size: 0.72rem; opacity: 0.85; white-space: nowrap; }
        .slots { padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 6px; }
        .slot {
            background: #e8f0fe; color: #1a73e8; border-radius: 20px;
            padding: 4px 11px; font-size: 0.82rem; font-weight: 500; white-space: nowrap;
        }
        .empty { color: #666; font-style: italic; text-align: center; padding: 40px 0; }
        .footer { margin-top: 32px; font-size: 0.75rem; color: #aaa; text-align: center; }
        .language-switcher {
            display: flex; justify-content: flex-end; align-items: center;
            gap: 8px; margin-bottom: 18px; font-size: 0.8rem;
        }
        .language-switcher select {
            border: 1px solid #c7d0dc; border-radius: 6px; background: #fff;
            color: #202124; padding: 4px 8px; font: inherit;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="language-switcher">
        <label for="language-selector">${escapeHtml(t(locale, 'shell.language'))}</label>
        <select id="language-selector" aria-label="${escapeHtml(t(locale, 'shell.language'))}">
            <option value="fr"${locale === 'fr' ? ' selected' : ''}>${escapeHtml(t(locale, 'shell.language.fr'))}</option>
            <option value="en"${locale === 'en' ? ' selected' : ''}>${escapeHtml(t(locale, 'shell.language.en'))}</option>
        </select>
    </div>
    <div id="loading">
        <div class="spinner"></div>
        <p class="loading-title">${escapeHtml(t(locale, 'loading.heading'))}</p>
        <p class="loading-sub">${escapeHtml(t(locale, 'loading.sub'))}</p>
    </div>
    <div id="error-box"></div>
    <div id="results"></div>
</div>

<script>
(function () {
    const CAL   = ${JSON.stringify({ id: cal.id, label: cal.label, emoji: cal.emoji, originalUrl: cal.originalUrl, description: cal.description[locale] ?? cal.description.en })};
    const I18N  = ${JSON.stringify(clientI18N)};
    const LANGUAGE_KEY = 'google-slot-proxy-language';
    const browserLanguage = (navigator.languages || [navigator.language || 'en'])[0];
    const browserLocale = browserLanguage.toLowerCase().split('-')[0] === 'fr' ? 'fr' : 'en';
    let storedLocale = null;
    try { storedLocale = localStorage.getItem(LANGUAGE_KEY); } catch (_) {}
    if (storedLocale === browserLocale) {
        try { localStorage.removeItem(LANGUAGE_KEY); } catch (_) {}
        storedLocale = null;
    }
    if ((storedLocale === 'fr' || storedLocale === 'en') && storedLocale !== I18N.locale) {
        const url = new URL(window.location.href);
        url.searchParams.set('lang', storedLocale);
        window.location.replace(url);
        return;
    }
    document.getElementById('language-selector').addEventListener('change', event => {
        const selectedLocale = event.target.value;
        const url = new URL(window.location.href);
        if (selectedLocale === browserLocale) {
            try { localStorage.removeItem(LANGUAGE_KEY); } catch (_) {}
            url.searchParams.delete('lang');
        } else {
            try { localStorage.setItem(LANGUAGE_KEY, selectedLocale); } catch (_) {}
            url.searchParams.set('lang', selectedLocale);
        }
        window.location.assign(url);
    });

    // Rehydrate plural functions from their serialized source
    const plural = {};
    for (const [k, src] of Object.entries(I18N.pluralDefs)) {
        // Each src is like "n => \`...\`" — wrap in parens to eval as expression
        plural[k] = eval('(' + src + ')');
    }

    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Client-side groupByWeek (mirrors lib/helpers.js)
    function groupByWeek(days) {
        const weeks = new Map();
        const tag   = I18N.intlLocale;
        for (const day of days) {
            const ts = day.slots[0]?.tsMs;
            if (!ts) continue;
            const d   = new Date(ts);
            const dow = (d.getDay() + 6) % 7;
            const mon = new Date(d);
            mon.setDate(d.getDate() - dow);
            mon.setHours(0, 0, 0, 0);
            const key = mon.toISOString();
            if (!weeks.has(key)) weeks.set(key, { monday: mon, days: [] });
            weeks.get(key).days.push(day);
        }
        const fmt = d => d.toLocaleDateString(tag, { day: 'numeric', month: 'long' });
        return [...weeks.entries()]
            .sort(([a],[b]) => a.localeCompare(b))
            .map(([,{monday, days}]) => {
                const sun = new Date(monday);
                sun.setDate(monday.getDate() + 6);
                const label = I18N.strings.weekTemplate
                    .replace('{from}', fmt(monday))
                    .replace('{to}',   fmt(sun));
                return { label, days };
            });
    }

    function renderResults(data) {
        const s     = I18N.strings;
        const weeks = groupByWeek(data.days);
        const totalSlots = data.days.reduce((n, d) => n + d.slots.length, 0);

        const h1 = s.calH1prefix
            ? esc(s.calH1prefix) + ' ' + esc(CAL.label)
            : esc(CAL.label) + ' slots';

        const weekSections = weeks.length > 0
            ? weeks.map(({ label, days }) =>
                '<section class="week">' +
                '<h2 class="week-label">' + esc(label) + '</h2>' +
                '<div class="day-grid">' +
                days.map(day => {
                    const c = day.slots.length;
                    return '<div class="day-card">' +
                        '<div class="day-header">' +
                        '<span class="day-name">'  + esc(day.fullDate) + '</span>' +
                        '<span class="slot-count">' + esc(plural.slots(c)) + '</span>' +
                        '</div><div class="slots">' +
                        day.slots.map(sl => '<span class="slot">' + esc(sl.label) + '</span>').join('') +
                        '</div></div>';
                }).join('') +
                '</div></section>'
            ).join('')
            : '<p class="empty">' + esc(s.empty) + '</p>';

        const dateStr = new Date().toLocaleString(I18N.intlLocale);

        return '<a class="back" href="/">' + esc(s.back) + '</a>' +
            '<div class="page-header">' +
            '<h1>' + CAL.emoji + ' ' + h1 + '</h1>' +
            '<p>' + esc(CAL.description) + '</p>' +
            '</div>' +
            '<div class="notice">' +
            '<strong>' + esc(s.noticeStrong) + '</strong> ' +
            esc(s.noticeBook) + ' ' +
            '<a href="' + esc(CAL.originalUrl) + '" target="_blank" rel="noopener">' + esc(s.noticeLink) + '</a> ' +
            esc(s.noticeConfirm) +
            '</div>' +
            '<p class="summary">' +
            esc(plural.days(data.days.length)) + ' &nbsp;·&nbsp; ' +
            esc(plural.totalSlots(totalSlots)) +
            '</p>' +
            weekSections +
            '<p class="footer">' + esc(s.updatedAt) + ' ' + esc(dateStr) + '</p>';
    }

    fetch('/api/' + CAL.id)
        .then(res => {
            if (!res.ok) return res.json().then(j => Promise.reject(new Error(j.error || res.statusText)));
            return res.json();
        })
        .then(data => {
            document.getElementById('loading').style.display = 'none';
            const el = document.getElementById('results');
            el.innerHTML = renderResults(data);
            el.classList.add('visible');
        })
        .catch(err => {
            document.getElementById('loading').style.display = 'none';
            const s  = I18N.strings;
            const el = document.getElementById('error-box');
            el.innerHTML =
                '<strong>' + esc(s.errorTitle) + '</strong><br>' +
                esc(err.message) + '<br><br>' +
                '<a href="/debug/' + esc(CAL.id) + '">' + esc(s.errorDiagnose) + '</a>';
            el.classList.add('visible');
        });
}());
</script>
</body>
</html>`;
}

module.exports = { renderLoading };