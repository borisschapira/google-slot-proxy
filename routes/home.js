const { Router } = require("express");
const { CALENDARS } = require("../config");
const { detectLocale } = require("../lib/i18n");
const { renderHome } = require("../views/home.view");

const router = Router();

router.get("/", (req, res) => {
  const locale = detectLocale(req);
  res.send(renderHome(CALENDARS, locale));
});

module.exports = router;
