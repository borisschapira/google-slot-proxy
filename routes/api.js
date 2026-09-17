// ── JSON API route ────────────────────────────────────────────────────────────
// GET /api/:calId  →  { title, cal, days }
// Called by the client-side loading page; does the heavy Puppeteer work.

const { Router } = require('express');
const { CALENDAR_MAP, CALENDAR_TIME_ZONE } = require('../config');
const { scrapeCalendar } = require('../lib/scraper');

const CACHE_TTL_MS = 5 * 60 * 1000;

function isCacheEnabled() {
    return ['1', 'true', 'yes', 'on'].includes((process.env.CACHE || '').toLowerCase());
}

function createApiRouter(scraper = scrapeCalendar) {
    const router = Router();
    const cache = new Map();

    router.get('/:calId', async (req, res) => {
        const cal = CALENDAR_MAP[req.params.calId];
        if (!cal) return res.status(404).json({ error: 'Calendar not found.' });

        try {
            let data;
            if (isCacheEnabled()) {
                const cached = cache.get(cal.id);
                if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
                    data = cached.data;
                } else {
                    cache.delete(cal.id);
                }
            }

            if (data === undefined) {
                data = await scraper(cal.originalUrl);
                if (isCacheEnabled()) {
                    cache.set(cal.id, { data, createdAt: Date.now() });
                }
            }

            res.json({
                title: data.title,
                timeZone: CALENDAR_TIME_ZONE,
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