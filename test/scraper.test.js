const http = require("node:http");
const { expect } = require("chai");
const { scrapeCalendar } = require("../lib/scraper");
const { CALENDAR_TIME_ZONE, MAX_LOOKAHEAD_DAYS } = require("../config");

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKey(timestamp) {
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(new Date(timestamp))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date, count) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + count);
  return dateKey(result);
}

function getMonday(date) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result.toISOString().slice(0, 10);
}

  function calendarPage(startDate, locale) {
  return `<!doctype html>
  <html lang="${locale}">
<head><meta charset="utf-8"><title>Calendar fixture</title></head>
<body>
  <main id="calendar"></main>
  <script>
    const startDate = new Date(${JSON.stringify(startDate)} + "T00:00:00Z");
      const locale = ${JSON.stringify(locale)};
      const labels = locale === "fr"
        ? {
            previousMonth: "Mois précédent",
            nextMonth: "Mois suivant",
            previousDay: "Jour précédent",
            nextDay: "Jour suivant"
          }
        : {
            previousMonth: "Previous month",
            nextMonth: "Next month",
            previousDay: "Previous day",
            nextDay: "Next day"
          };
      let weekStart = new Date(startDate);
      let selectedDate = new Date(startDate);
    let visibleMonth = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      1
    ));

    function addDays(date, count) {
      const result = new Date(date);
      result.setUTCDate(result.getUTCDate() + count);
      return result;
    }

    function mondayOf(date) {
      const result = new Date(date);
      result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
      return result;
    }

    function render() {
      const dateLabel = new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC"
      });
      const monthLabel = new Intl.DateTimeFormat(locale, {
        month: "long",
        timeZone: "UTC"
      });
      const weekdayLabel = new Intl.DateTimeFormat(locale, {
        weekday: "long",
        timeZone: "UTC"
      });
      const gridStart = new Date(visibleMonth);
      gridStart.setUTCDate(1 - ((gridStart.getUTCDay() + 6) % 7));
      const dateButtons = Array.from({ length: 42 }, (_, index) => {
        const date = addDays(gridStart, index);
        const day = date.getUTCDate();
        const weekday = weekdayLabel.format(date);
        const label = date.getUTCMonth() === visibleMonth.getUTCMonth()
          ? day + ", " + weekday
          : monthLabel.format(date) + " " + day + ", " + weekday;
        const key = date.toISOString().slice(0, 10);
        return '<button class="calendar-date" data-date="' + key +
          '" aria-label="' + label + '">' + day + '</button>';
      }).join("");
      const dayLists = Array.from({ length: 7 }, (_, index) => {
        const date = addDays(weekStart, index);
        const timestamp = Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          12
        );
        return '<div role="list" aria-label="' + dateLabel.format(date) + '">' +
          '<div role="listitem"><button aria-label="12:00pm" ' +
          'data-date-time="' + timestamp + '"></button></div></div>';
      }).join("");

      document.getElementById("calendar").innerHTML =
        '<button aria-label="' + labels.previousMonth + '">' + labels.previousMonth + '</button>' +
        '<button aria-label="' + labels.nextMonth + '">' + labels.nextMonth + '</button>' +
        '<div id="month-grid">' + dateButtons + '</div>' +
        '<div id="week">' + dayLists + '</div>' +
        '<button aria-label="' + labels.previousDay + '">' + labels.previousDay + '</button>' +
        '<button aria-label="' + labels.nextDay + '">' + labels.nextDay + '</button>';

      document.querySelectorAll(".calendar-date").forEach((button) => {
        button.addEventListener("click", () => {
          selectedDate = new Date(button.dataset.date + "T00:00:00Z");
          weekStart = mondayOf(selectedDate);
          render();
        });
      });
      document.querySelector('[aria-label="' + labels.nextMonth + '"]').addEventListener(
        "click",
        () => {
          visibleMonth = new Date(Date.UTC(
            visibleMonth.getUTCFullYear(),
            visibleMonth.getUTCMonth() + 1,
            1
          ));
          render();
        }
      );
      document.querySelector('[aria-label="' + labels.nextDay + '"]').addEventListener(
        "click",
        () => { selectedDate = addDays(selectedDate, 1); }
      );
    }

    render();
  </script>
</body>
</html>`;
}

describe("calendar scraper navigation", function () {
  this.timeout(30000);

  for (const locale of ["en", "fr"]) {
    it(`advances by date and month to cover the lookahead (${locale})`, async () => {
      const today = dateKey(Date.now());
      const startDate = getMonday(today);
      const latestDate = addDays(today, MAX_LOOKAHEAD_DAYS);
      const server = http.createServer((req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(calendarPage(startDate, locale));
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      try {
        const { port } = server.address();
        const result = await scrapeCalendar(`http://127.0.0.1:${port}/calendar`);

        expect(result.title).to.equal("Calendar fixture");
        expect(result.days).to.not.be.empty;
        const collectedDates = result.days.map((day) =>
          dateKey(day.slots[0].tsMs),
        );
        expect(collectedDates.at(-1)).to.equal(latestDate);
        expect(collectedDates.every((date) => date <= latestDate)).to.equal(true);
      } finally {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
  }
});
