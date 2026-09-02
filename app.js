const express = require("express");

const homeRouter = require("./routes/home");
const calendarRouter = require("./routes/calendar");
const { createApiRouter } = require("./routes/api");
const debugRouter = require("./routes/debug");

function createApp({ scraper } = {}) {
  const app = express();

  // Block all indexing at the HTTP level, before any route runs
  app.use((req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  // Explicit robots.txt — disallow everything
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send("User-agent: *\nDisallow: /\n");
  });

  app.use("/", homeRouter);
  app.use("/api", createApiRouter(scraper));
  app.use("/debug", debugRouter);
  app.use("/", calendarRouter); // last: catches /:calId without shadowing /api or /debug

  return app;
}

const app = createApp();
module.exports = app;
module.exports.createApp = createApp;
