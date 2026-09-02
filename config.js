// ── Application-wide configuration ───────────────────────────────────────────

const CALENDARS = [
  {
    id: "30min",
    label: "30 minutes",
    emoji: "⚡",
    description: {
      fr: "Idéal pour un point rapide, une mise à jour de statut ou un premier contact.",
      en: "Ideal for a quick check-in, a status update, or a first contact.",
    },
    originalUrl: "https://calendar.app.google/wE6gKW3G1YYqqPgT7",
  },
  {
    id: "60min",
    label: "60 minutes",
    emoji: "💬",
    description: {
      fr: "Une heure complète pour une discussion approfondie, une démo ou une session de travail.",
      en: "A full hour for a deeper discussion, demo, or working session.",
    },
    originalUrl: "https://calendar.app.google/XpTgH4sZNsHTSi3k6",
  },
  {
    id: "90min",
    label: "90 minutes",
    emoji: "🔭",
    description: {
      fr: "Une session longue pour des ateliers, de la planification ou des sujets complexes.",
      en: "An extended session for workshops, planning, or complex topics.",
    },
    originalUrl: "https://calendar.app.google/fzR5tJrv9iWnyGbQA",
  },
];

const CALENDAR_MAP = Object.fromEntries(CALENDARS.map((c) => [c.id, c]));

const MAX_EXTRA_WEEKS = 6;

module.exports = { CALENDARS, CALENDAR_MAP, MAX_EXTRA_WEEKS };
