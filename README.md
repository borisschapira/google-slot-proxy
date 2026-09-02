# google-slot-proxy

A lightweight Node.js proxy that scrapes Google Calendar appointment scheduling pages and presents available slots in a clean, multilingual interface — useful for people who cannot access Google Calendar directly.

---

## How it works

```
Browser → Express server → local Puppeteer (dev) / Browserless (prod) → Google Calendar → slots
```

On each page visit, a headless Chrome session navigates the Google Calendar scheduling page, extracts available slots week by week, and renders them as a simple HTML page. In development, Chrome is launched locally by Puppeteer; other environments use [Browserless](https://browserless.io). The language defaults to the visitor's `Accept-Language` header (French or English), and can be changed with the selector in the Shell.

---

## Prerequisites

- **Node.js 22+**
- A **[Browserless](https://browserless.io)** account and API token for production (I used the free tier: 6 h/month)

---

## Installation

```bash
# 1. Clone or copy the project
git clone <your-repo-url>
cd google-slot-proxy

# 2. Install dependencies
npm install

# 3. Set environment variables (see Configuration below)
cp .env.example .env
# Edit .env and fill in your values

# 4. Start
npm start
```

On the hosted server, you may want to prefix the `node`and `npm` with `NODEJS_VERSION=22`to ensure the correct Node.js version is used.

---

## Configuration

All configuration is done via environment variables.

| Variable | Required | Description |
|---|---|---|
| `BROWSERLESS_TOKEN` | Production | API token from [browserless.io](https://browserless.io) |
| `PORT` | No | Port to listen on (default: `3000`) |

Add `BROWSERLESS_TOKEN` to the production environment or `.env` file before starting the server. It is not needed in development.


### Local development

Create a `.env` file at the project root:

```
# Required in production only
BROWSERLESS_TOKEN=your_token_here
PORT=3000
```

Then load it when starting:

```bash
NODE_ENV=development node server.js
# Production:
node --env-file=.env server.js
# or, with npm:
npm start   # if you configure dotenv in package.json scripts
```

### Tests

The deterministic end-to-end suite uses Node's built-in test runner and
Puppeteer against an ephemeral local server. It covers the homepage, locale
selection, calendar loading, and the API contract with fixture data:

```bash
npm test
```

Live calendar integration tests use the configured Google Calendar URLs and
local Puppeteer scraping. They are opt-in because availability and Google's
DOM can change:

```bash
npm run test:live
```

This command sets `NODE_ENV=development`, so the scraper launches a local
Puppeteer browser instead of requiring a Browserless token.

A deterministic test failure indicates an application regression. A live-only
failure may indicate changed calendar data or DOM behavior; inspect the
`/debug/30min` route before changing the scraper.

> **Tip:** install [`dotenv`](https://www.npmjs.com/package/dotenv) or use Node 20.6+'s built-in `--env-file` flag.

### On alwaysdata

Admin panel → **Sites** → your site → **Environment variables** → add `BROWSERLESS_TOKEN`.

---

## Calendars

Calendars are defined in `config.js`. Each entry has:

```js
{
    id:          '30min',           // used as the URL path: /30min
    label:       '30 minutes',      // displayed in the UI
    emoji:       '⚡',
    description: {
        fr: 'Description en français.',
        en: 'Description in English.',
    },
    originalUrl: 'https://calendar.app.google/…',
}
```

To add or remove a calendar, edit the `CALENDARS` array in `config.js` — all routes, views, and debug links update automatically.

---

## Routes

| Route | Description |
|---|---|
| `GET /` | Homepage — lists all calendars with links |
| `GET /30min` | Available slots for the 30-minute calendar |
| `GET /60min` | Available slots for the 60-minute calendar |
| `GET /90min` | Available slots for the 90-minute calendar |
| `GET /api/30min` | Raw JSON data for a calendar (used by the loading page) |
| `GET /debug` | Debug index |
| `GET /debug/30min` | JSON diagnostic report for a calendar |
| `GET /debug/30min?shot=1` | Screenshot of what the scraper sees |
| `GET /debug/30min?html=1` | Raw HTML of the scraped page |

> Replace `30min` with `60min` or `90min` for the other calendars.

---

## Internationalisation

The UI is available in **French** and **English**. The initial language is detected from the `Accept-Language` HTTP header sent by the visitor's browser. French is used when it is the top-priority language; English is the fallback. The Shell's selector lets visitors choose either language. A choice different from the browser language is remembered in `localStorage`; choosing the browser language again removes that preference.

To test locally:

```bash
# English
curl -H "Accept-Language: en" http://localhost:3000

# French
curl -H "Accept-Language: fr" http://localhost:3000
```

---

## Project structure

```
server.js              Entry point — starts the HTTP server
app.js                 Express app — middleware and route mounting
config.js              Calendar definitions and constants
│
lib/
│  scraper.js          Puppeteer local/Browserless scraping logic
│  helpers.js          Shared utilities (escapeHtml, groupByWeek, sleep)
│  i18n.js             Translations, locale detection, plural helpers
│
views/
│  shell.js            Shared HTML shell (head, body wrapper, footer)
│  home.view.js        Homepage markup
│  loading.view.js     Loading interstitial + client-side slot renderer
│  calendar.view.js    (server-side calendar view, used by error pages)
│  debug.view.js       Debug page markup
│
routes/
   home.js             GET /
   calendar.js         GET /:calId  (returns loading page immediately)
   api.js              GET /api/:calId  (does the scraping, returns JSON)
   debug.js            GET /debug, GET /debug/:calId
```

---

## Deployment

The project is plain Node.js — no build step. Copy the files, run `npm install`, set the environment variable, and start the server.

### Works on

- Any **VPS or dedicated server** with Node 18+
- **Railway**, **Render**, **Fly.io** (push the repo, set `BROWSERLESS_TOKEN`)

### Does not work on

- **Vercel / Netlify / Cloudflare Workers** — serverless functions time out before Puppeteer finishes
- **Shared PHP hosting** without a Node.js runtime

### Recommended `package.json` scripts

```json
{
  "engines": { "node": ">=18.0.0" },
  "scripts": {
    "start": "node server.js",
    "dev":   "node --watch server.js"
  }
}
```

---

## Troubleshooting

### `BROWSERLESS_TOKEN environment variable is not set`
Set the variable in your environment or `.env` file (see Configuration).

### Slots page loads but shows nothing
Visit `/debug/30min` to inspect what the scraper found. Key fields:
- `dateRoleLists` — should list one entry per day with a year in the label
- `allSlotButtons` — should list individual time slots

If both are empty, Google may have changed their DOM. The scraper uses only ARIA roles (`role="list"`, `role="listitem"`) and `data-date-time` attributes, which are stable, but check `navButtons` to confirm the "next day" button label hasn't changed locale.

### `SyntaxError: Unexpected token '.'`
The Node.js version on the server is too old. Upgrade to Node 18+.