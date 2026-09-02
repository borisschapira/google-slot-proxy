// ── Entry point ───────────────────────────────────────────────────────────────

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = require("./app");
const PORT = process.env.PORT || 8101;

if (process.env.NODE_ENV === "development") {
  console.log("Launching local Puppeteer browser (development mode)...");
}

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
