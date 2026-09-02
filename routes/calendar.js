const { Router } = require("express");
const { CALENDAR_MAP } = require("../config");
const { resolveLocale } = require("../lib/i18n");
const { renderLoading } = require("../views/loading.view");

const router = Router();

// Returns the loading interstitial immediately; the client JS fetches /api/:calId.
router.get("/:calId", (req, res) => {
  const cal = CALENDAR_MAP[req.params.calId];
  if (!cal) return res.status(404).send("Not found.");
  const locale = resolveLocale(req);
  res.send(renderLoading(cal, locale));
});

module.exports = router;
