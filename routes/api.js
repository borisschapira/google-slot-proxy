// ── JSON API route ────────────────────────────────────────────────────────────
// GET /api/:calId  →  { title, cal, days }
// Called by the client-side loading page; does the heavy Puppeteer work.

const { Router } = require('express');
const { CALENDAR_MAP } = require('../config');
const { scrapeCalendar } = require('../lib/scraper');

function createApiRouter(scraper = scrapeCalendar) {
    const router = Router();

    router.get('/:calId', async (req, res) => {
        const cal = CALENDAR_MAP[req.params.calId];
        if (!cal) return res.status(404).json({ error: 'Calendar not found.' });

        try {
            const data = await scraper(cal.originalUrl);
            res.json({
                title: data.title,
                cal:   { id: cal.id, label: cal.label, emoji: cal.emoji, originalUrl: cal.originalUrl, description: cal.description },
                days:  data.days,
            });
        } catch (err) {
            console.error(`[api] scrape error for ${cal.id}:`, err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = createApiRouter();
module.exports.createApiRouter = createApiRouter;