const { Router } = require("express");
const { CALENDARS, CALENDAR_MAP } = require("../config");
const { resolveLocale } = require("../lib/i18n");
const {
  scrapeDebugInfo,
  screenshotPage,
  rawHtmlPage,
} = require("../lib/scraper");
const { renderDebugIndex, renderDebugError } = require("../views/debug.view");

const router = Router();

router.get("/", (req, res) => {
  const locale = resolveLocale(req);
  res.send(renderDebugIndex(CALENDARS, locale));
});

router.get("/:calId", async (req, res) => {
  const cal = CALENDAR_MAP[req.params.calId];
  const locale = resolveLocale(req);
  if (!cal) return res.status(404).send("Not found.");

  try {
    if (req.query.shot !== undefined) {
      const png = await screenshotPage(cal.originalUrl);
      res.setHeader("Content-Type", "image/png");
      return res.send(png);
    }
    if (req.query.html !== undefined) {
      const html = await rawHtmlPage(cal.originalUrl);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }
    const report = await scrapeDebugInfo(cal.originalUrl);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify({ calendar: cal.id, ...report }, null, 2));
  } catch (err) {
    console.error(`[debug] ${cal.id}:`, err);
    res.status(500).send(renderDebugError(cal.id, err, locale));
  }
});

module.exports = router;
