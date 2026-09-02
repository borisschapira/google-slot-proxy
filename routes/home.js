const { Router } = require("express");
const { CALENDARS } = require("../config");
const { resolveLocale } = require("../lib/i18n");
const { renderHome } = require("../views/home.view");

const router = Router();

router.get("/", (req, res) => {
  const locale = resolveLocale(req);
  res.send(renderHome(CALENDARS, locale));
});

module.exports = router;
