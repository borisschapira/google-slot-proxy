// ── Calendar sub-page view ────────────────────────────────────────────────────

const { shell } = require("./shell");
const { escapeHtml, groupByWeek } = require("../lib/helpers");

/**
 * Renders a full calendar slots page.
 *
 * @param {object} cal   - calendar config entry from config.js
 * @param {object} data  - { title, days } returned by scrapeCalendar()
 */
function renderCalendar(cal, data) {
  const weeks = groupByWeek(data.days);
  const totalSlots = data.days.reduce((n, d) => n + d.slots.length, 0);

  const weekSections =
    weeks.length > 0
      ? weeks
          .map(
            ({ label, days }) => `
            <section class="week">
                <h2 class="week-label">${escapeHtml(label)}</h2>
                <div class="day-grid">
                    ${days.map(renderDayCard).join("")}
                </div>
            </section>`,
          )
          .join("")
      : '<p class="empty">Aucun créneau disponible actuellement.</p>';

  return shell({
    title: `Créneaux ${cal.label} — ${data.title}`,
    bodyContent: `
        <a class="back" href="/">Retour à l'accueil</a>

        <div class="page-header">
            <h1>${cal.emoji} Créneaux de ${escapeHtml(cal.label)}</h1>
            <p>${escapeHtml(cal.description)}</p>
        </div>

        <div class="notice">
            <strong>Vous pouvez accéder à Google Calendar&nbsp;?</strong>
            Réservez directement sur
            <a href="${escapeHtml(cal.originalUrl)}" target="_blank" rel="noopener">
                la page d'origine ↗
            </a>
            pour confirmer votre créneau instantanément.
        </div>

        <p class="summary">
            ${data.days.length} jour${data.days.length !== 1 ? "s" : ""}
            &nbsp;·&nbsp;
            ${totalSlots} créneau${totalSlots !== 1 ? "x" : ""} disponible${totalSlots !== 1 ? "s" : ""}
        </p>

        ${weekSections}

        <style>
            .summary { font-size: 0.85rem; color: #888; margin-bottom: 20px; }
            .week { margin-bottom: 32px; }
            .week-label {
                font-size: 0.78rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: #999;
                margin-bottom: 12px;
                border-bottom: 1px solid #dde3ea;
                padding-bottom: 6px;
            }
            .day-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 12px;
            }
            .day-card {
                background: #fff;
                border-radius: 12px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.10);
                overflow: hidden;
            }
            .day-header {
                background: #1a73e8;
                color: #fff;
                padding: 9px 14px;
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 8px;
            }
            .day-name  { font-weight: 600; font-size: 0.85rem; }
            .slot-count { font-size: 0.72rem; opacity: 0.85; white-space: nowrap; }
            .slots {
                padding: 10px 12px;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }
            .slot {
                background: #e8f0fe;
                color: #1a73e8;
                border-radius: 20px;
                padding: 4px 11px;
                font-size: 0.82rem;
                font-weight: 500;
                white-space: nowrap;
            }
            .empty { color: #666; font-style: italic; text-align: center; padding: 40px 0; }
        </style>`,
  });
}

/**
 * Renders the error state for a calendar page.
 *
 * @param {object} cal  - calendar config entry
 * @param {Error}  err
 */
function renderCalendarError(cal, err) {
  return shell({
    title: "Erreur de chargement",
    bodyContent: `
        <a class="back" href="/">Retour à l'accueil</a>

        <div class="page-header">
            <h1>Erreur de chargement</h1>
            <p>${escapeHtml(err.message)}</p>
        </div>

        <p>
            En attendant, vous pouvez accéder directement à
            <a href="${escapeHtml(cal.originalUrl)}" target="_blank" rel="noopener">
                la page Google Calendar ↗
            </a>.
        </p>

        <p style="margin-top:12px; font-size:0.85rem; color:#888;">
            <a href="/debug/${cal.id}">Rapport de diagnostic JSON</a>
            &nbsp;·&nbsp;
            <a href="/debug/${cal.id}?shot=1">Capture d'écran</a>
        </p>`,
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

function renderDayCard(day) {
  const count = day.slots.length;
  return `
        <div class="day-card">
            <div class="day-header">
                <span class="day-name">${escapeHtml(day.fullDate)}</span>
                <span class="slot-count">${count} créneau${count !== 1 ? "x" : ""}</span>
            </div>
            <div class="slots">
                ${day.slots.map((s) => `<span class="slot">${escapeHtml(s.label)}</span>`).join("")}
            </div>
        </div>`;
}

module.exports = { renderCalendar, renderCalendarError };
