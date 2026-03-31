const express = require('express');
const fs = require('fs');
const path = require('path');



module.exports = (getPriceCache) => {
    const router = express.Router();
    const VIP_LOGS_DIR = path.join(__dirname, '../../data/vip_logs');

    // Ensure directory exists
    if (!fs.existsSync(VIP_LOGS_DIR)) {
        fs.mkdirSync(VIP_LOGS_DIR, { recursive: true });
    }

    // GET /api/reports/daily/latest
    router.get('/latest', (req, res) => {
        try {
            const files = fs.readdirSync(VIP_LOGS_DIR)
                .filter(f => f.endsWith('.json'))
                .sort((a, b) => b.localeCompare(a)); // Sort descending by date (YYYY-MM-DD.json)

            if (files.length === 0) {
                return res.status(404).json({ success: false, error: 'No reports found' });
            }

            const latestFile = path.join(VIP_LOGS_DIR, files[0]);
            const data = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

            // [Red Team] Live price merging for dashboard accuracy
            if (typeof getPriceCache === 'function') {
                const cache = getPriceCache();
                if (data.recommendations && Array.isArray(data.recommendations)) {
                    data.recommendations = data.recommendations.map(stock => {
                        const cached = cache[stock.code];
                        if (cached) {
                            return { 
                                ...stock, 
                                current_price: cached.price || stock.current_price,
                                price_change: cached.change || stock.price_change
                            };
                        }
                        return stock;
                    });
                }
            }

            res.json(data);

        } catch (error) {
            console.error('[PublicReport API Error]', error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    return router;
};
