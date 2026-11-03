const http = require("node:http");
const { expect } = require("chai");
const { rawHtmlPage } = require("../lib/scraper");

const calendarHtml = `<!doctype html>
<html lang="en">
<head><title>Calendar fixture</title></head>
<body>
  <div role="list" aria-label="Monday, November 2, 2026">
    <div role="listitem">
      <button aria-label="9:00am" data-date-time="1793610000000"></button>
    </div>
  </div>
</body>
</html>`;

describe("scraper browser concurrency", function () {
  this.timeout(15000);

  it("serializes concurrent debug browser sessions", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    let requestCount = 0;
    let releaseFirstResponse;
    let firstRequestStarted;
    const firstRequest = new Promise((resolve) => {
      firstRequestStarted = resolve;
    });
    const firstResponseGate = new Promise((resolve) => {
      releaseFirstResponse = resolve;
    });
    const server = http.createServer(async (req, res) => {
      if (req.url !== "/calendar") {
        res.writeHead(404).end();
        return;
      }
      requestCount += 1;
      if (requestCount === 1) {
        firstRequestStarted();
        await firstResponseGate;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(calendarHtml);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/calendar`;
      const firstDebugRequest = rawHtmlPage(url);
      await firstRequest;
      const secondDebugRequest = rawHtmlPage(url);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(requestCount).to.equal(1);

      releaseFirstResponse();
      const [firstHtml, secondHtml] = await Promise.all([
        firstDebugRequest,
        secondDebugRequest,
      ]);
      expect(firstHtml).to.include("Calendar fixture");
      expect(secondHtml).to.include("Calendar fixture");
      expect(requestCount).to.equal(2);
    } finally {
      releaseFirstResponse();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
