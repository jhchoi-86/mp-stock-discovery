const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const VIP_LOGS_DIR = path.join(__dirname, '../../data/vip_logs');

const { getFullPriceCache } = require('../utils/fullUniversePoller.cjs');

// Ensure directory exists
if (!fs.existsSync(VIP_LOGS_DIR)) {
    fs.mkdirSync(VIP_LOGS_DIR, { recursive: true });
}

// GET /api/reports/daily/latest (Legacy)
const getLatestReportHandler = (req, res) => {
    try {
        const files = fs.readdirSync(VIP_LOGS_DIR)
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => b.localeCompare(a)); // Sort descending by date (YYYY-MM-DD.json)

        if (files.length === 0) {
            return res.status(404).json({ success: false, error: 'No reports found' });
        }

        const latestFile = path.join(VIP_LOGS_DIR, files[0]);
        let data = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

        // --- Live Price Merge Logic (v3.6.1) ---
        const liveCache = getFullPriceCache();
        const currentFile = files[0]; // latest.json or YYYY-MM-DD.json
        
        // Determine if this is a legacy report (before 2026-04-04)
        let isLegacyReport = false;
        if (currentFile.includes('202') && currentFile.endsWith('.json')) {
            const dateMatch = currentFile.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (dateMatch) {
                const dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                if (dateStr <= '2026-04-03') isLegacyReport = true;
            }
        }

        if (!isLegacyReport && data && Array.isArray(data.stocks)) {
            data.stocks = data.stocks.map(stock => {
                const live = liveCache[stock.code];
                if (live && live.price) {
                    const currentPrice = live.price;
                    const recommendedPrice = stock.target_price || stock.current_price || currentPrice;
                    
                    // Update current price
                    stock.current_price = currentPrice;
                    
                    // Recalculate yield (Current - Recommended) / Recommended * 100
                    if (recommendedPrice > 0) {
                        stock.yield_pct = Number(((currentPrice - recommendedPrice) / recommendedPrice * 100).toFixed(2));
                    }
                }
                return stock;
            });
        }

        res.json(data);

    } catch (error) {
        console.error('[PublicReport API Error]', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

router.get('/latest', getLatestReportHandler);

module.exports = { router, getLatestReportHandler };
