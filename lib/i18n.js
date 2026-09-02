// ── Internationalisation ──────────────────────────────────────────────────────
// Supported locales: 'fr' (default) and 'en'.
// Detection is based on the Accept-Language request header.

const TRANSLATIONS = {
  fr: {
    // Shell
    "shell.lang": "fr",
    "shell.updatedAt": "Mis à jour le",

    // Home
    "home.title": "Prendre rendez-vous",
    "home.h1": "📅 Prendre rendez-vous",
    "home.intro":
      "Choisissez la durée de réunion qui vous convient. Si vous pouvez accéder à Google Calendar directement, préférez les liens d'origine ci-dessous\u00a0: ils offrent une meilleure expérience et permettent de confirmer votre créneau immédiatement.",
    "home.proxy.strong": "Cette page est un proxy.",
    "home.proxy.body":
      "Elle affiche les créneaux disponibles pour les personnes qui ne peuvent pas accéder à Google Calendar. Les créneaux sont mis à jour à chaque chargement de page mais la confirmation se fait via Google.",
    "home.btn.slots": "Voir les créneaux",
    "home.btn.gcal": "Ouvrir dans Google Calendar\u00a0↗",

    // Navigation
    "nav.back": "Retour à l'accueil",
    "nav.backDebug": "Retour au debug",

    // Calendar notice
    "cal.notice.strong": "Vous pouvez accéder à Google Calendar\u00a0?",
    "cal.notice.book": "Réservez directement sur",
    "cal.notice.link": "la page d'origine\u00a0↗",
    "cal.notice.confirm": "pour confirmer votre créneau instantanément.",

    // Calendar content
    "cal.h1prefix": "Créneaux de",
    "cal.empty": "Aucun créneau disponible actuellement.",
    "cal.week": "Semaine du {from} au {to}",

    // Loading interstitial
    "loading.pageTitle": "Chargement",
    "loading.heading": "Récupération des créneaux…",
    "loading.sub":
      "Le calendrier est chargé en temps réel depuis Google Calendar. Cela peut prendre quelques secondes.",

    // Error
    "error.title": "Erreur de chargement",
    "error.diagnose": "Rapport de diagnostic",

    // Debug
    "debug.title": "Debug — Calendriers",
    "debug.h1": "🔬 Debug",
    "debug.intro": "Choisissez un calendrier à diagnostiquer.",
    "debug.json": "JSON",
    "debug.screenshot": "Capture d'écran",
    "debug.html": "HTML brut",
  },

  en: {
    // Shell
    "shell.lang": "en",
    "shell.updatedAt": "Updated on",

    // Home
    "home.title": "Book an appointment",
    "home.h1": "📅 Book an appointment",
    "home.intro":
      "Choose the meeting duration that suits you. If you can access Google Calendar directly, we encourage you to use the original links below — they offer a better experience and let you confirm your slot immediately.",
    "home.proxy.strong": "This page is a proxy.",
    "home.proxy.body":
      "It displays available slots for people who cannot access Google Calendar directly. Slots are refreshed on every page load but booking is confirmed through Google.",
    "home.btn.slots": "View slots",
    "home.btn.gcal": "Open in Google Calendar ↗",

    // Navigation
    "nav.back": "Back to home",
    "nav.backDebug": "Back to debug",

    // Calendar notice
    "cal.notice.strong": "Can you access Google Calendar?",
    "cal.notice.book": "Book directly on",
    "cal.notice.link": "the original page ↗",
    "cal.notice.confirm": "to confirm your slot instantly.",

    // Calendar content
    "cal.h1prefix": "", // "30 minutes slots" — prefix is empty, see renderCalendar
    "cal.empty": "No slots currently available.",
    "cal.week": "Week of {from} to {to}",

    // Loading interstitial
    "loading.pageTitle": "Loading",
    "loading.heading": "Fetching slots…",
    "loading.sub":
      "The calendar is loaded in real time from Google Calendar. This may take a few seconds.",

    // Error
    "error.title": "Loading error",
    "error.diagnose": "Diagnostic report",

    // Debug
    "debug.title": "Debug — Calendars",
    "debug.h1": "🔬 Debug",
    "debug.intro": "Choose a calendar to diagnose.",
    "debug.json": "JSON",
    "debug.screenshot": "Screenshot",
    "debug.html": "Raw HTML",
  },
};

// ── Plural helpers ────────────────────────────────────────────────────────────
// Exported so views and client-side JS can share the same rules.

const PLURAL = {
  fr: {
    days: (n) => `${n} jour${n > 1 ? "s" : ""}`,
    slots: (n) => `${n} créneau${n > 1 ? "x" : ""}`,
    totalSlots: (n) =>
      `${n} créneau${n > 1 ? "x" : ""} disponible${n > 1 ? "s" : ""}`,
  },
  en: {
    days: (n) => `${n} day${n !== 1 ? "s" : ""}`,
    slots: (n) => `${n} slot${n !== 1 ? "s" : ""}`,
    totalSlots: (n) => `${n} available slot${n !== 1 ? "s" : ""}`,
  },
};

// ── Intl locale tags ──────────────────────────────────────────────────────────

const INTL_LOCALE = { fr: "fr-FR", en: "en-US" };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses the Accept-Language header and returns 'fr' or 'en'.
 * French is returned when it appears as the highest-priority language.
 */
function detectLocale(req) {
  const header = (req.headers["accept-language"] || "").toLowerCase();
  // Each token looks like "fr-FR" or "fr;q=0.9"
  const primary = header
    .split(",")[0]
    .trim()
    .split(";")[0]
    .trim()
    .split("-")[0];
  return primary === "fr" ? "fr" : "en";
}

/**
 * Returns the translation for a key, with optional {placeholder} interpolation.
 *
 * @param {string} locale - 'fr' | 'en'
 * @param {string} key
 * @param {object} [vars]  - e.g. { from: '1 sept.', to: '7 sept.' }
 */
function t(locale, key, vars = {}) {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS.en;
  let str = dict[key] ?? TRANSLATIONS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

/**
 * Returns plural helpers bound to a given locale.
 * @param {string} locale
 */
function plural(locale) {
  return PLURAL[locale] ?? PLURAL.en;
}

/**
 * Returns the full Intl locale tag (e.g. 'fr-FR') for a short locale code.
 */
function intlLocale(locale) {
  return INTL_LOCALE[locale] ?? "en-US";
}

module.exports = {
  detectLocale,
  t,
  plural,
  intlLocale,
  TRANSLATIONS,
  PLURAL,
  INTL_LOCALE,
};
