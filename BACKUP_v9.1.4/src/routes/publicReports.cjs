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
// GET /api/reports/daily/latest (SSOT Optimized v7.0)

// Utility to fetch report from JSON or DB
const fetchReportData = async (prisma, filePath, fallbackDate = null) => {
    let stocks = [];
    let header = {
        report_date: fallbackDate || new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
        universe: 'MP SSOT Unified Portfolio'
    };

    // [v8.6.0] 1. Try reading from DailyTop5 table (New SSOT)
    if (fallbackDate) {
        try {
            // fallbackDate is "YYYY-MM-DD" or "MM. DD."
            let dbDate = fallbackDate;
            if (fallbackDate.includes('. ')) {
                const parts = fallbackDate.split('. ').map(v => v.replace('.', '').padStart(2, '0'));
                dbDate = `${new Date().getFullYear()}-${parts[0]}-${parts[1]}`;
            }

            const dbTop5 = await prisma.dailyTop5.findMany({
                where: { date: dbDate },
                orderBy: { score: 'desc' }
            });

            if (dbTop5 && dbTop5.length > 0) {
                const liveCache = getFullPriceCache();
                stocks = dbTop5.map(s => {
                    const live = liveCache[s.code];
                    const currentPrice = live?.price || s.currentPrice;
                    return {
                        code: s.code,
                        name: s.name,
                        current_price: currentPrice,
                        entry1: s.entryPrice1,
                        entry_price: s.entryPrice1,
                        entry2: s.entryPrice2,
                        target: s.targetPrice1,
                        sl: s.stopLoss,
                        yield_pct: s.yield,
                        score: s.score,
                        stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
                        trend_type: s.category || '분석 중',
                        trend_strength: s.score >= 90 ? '강함' : '보통',
                        trade_amount: s.tradeAmount.toString(),
                        foreign_buy: (s.foreignBuy > 0 ? '+' : '') + s.foreignBuy.toLocaleString() + '주',
                        inst_buy: (s.instBuy > 0 ? '+' : '') + s.instBuy.toLocaleString() + '주',
                        recommended_at: s.date.split('-').slice(1).join('. ') + '.'
                    };
                });
                header.report_date = dbDate.split('-').slice(1).join('. ') + '..';
                return { stocks, header, source: 'db_top5' };
            }
        } catch (e) {
            console.error('[PublicReport] DailyTop5 DB Error:', e.message);
        }
    }

    // 2. Try reading from JSON file (Legacy SSOT)
    if (filePath && fs.existsSync(filePath)) {
        try {
            const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (report.stocks && report.stocks.length > 0) {
                stocks = report.stocks.map(s => ({
                    ...s,
                    recommended_at: s.recommended_at || report.header?.report_date || fallbackDate || new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + '.'
                }));
                header = report.header || header;
                return { stocks, header, source: 'json' };
            }
        } catch (e) {
            console.error(`[PublicReport] JSON Parse Error (${filePath}):`, e.message);
        }
    }

    // 3. Last Fallback to DB Snapshots (Generic Top 10)
    const dbSnapshots = await prisma.dailyStockSnapshot.findMany({
        where: { 
            starGrade: { notIn: ['0', 'nullable'], not: null } 
        },
        orderBy: [
            { createdAt: 'desc' },
            { starGrade: 'desc' }
        ],
        take: 10
    });

    const liveCache = getFullPriceCache();
    stocks = dbSnapshots.map(s => {
        const live = liveCache[s.code];
        const currentPrice = live?.price || Number(s.currentPrice);
        const entryPrice = Number(s.entryPrice1 || 0);
        let yieldPct = 0;
        if (entryPrice > 0) yieldPct = Number(((currentPrice - entryPrice) / entryPrice * 100).toFixed(2));

        return {
            code: s.code,
            name: s.name,
            current_price: currentPrice,
            entry1: entryPrice,
            entry_price: entryPrice,
            entry2: Number(s.entryPrice2 || 0),
            target: Number(s.targetPrice1 || 0),
            sl: Number(s.stopLoss || 0),
            yield_pct: yieldPct,
            score: s.score || 0,
            stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
            trend_type: s.trend || '분석 중',
            trend_strength: s.adx ? `${s.adx}` : '보통',
            trade_amount: s.tradeAmount ? s.tradeAmount.toString() : '0',
            foreign_buy: s.foreignBuy || '0',
            inst_buy: s.instBuy || '0',
            ema20: Number(s.ema20 || 0),
            ema60: Number(s.ema60 || 0),
            recommended_at: s.createdAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + '.'
        };
    });

    return { stocks, header, source: 'db_snapshot' };
};

// GET /api/reports/daily/latest
const getLatestReportHandler = async (req, res) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
        const latestPath = path.join(VIP_LOGS_DIR, 'latest.json');
        const result = await fetchReportData(prisma, latestPath);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[PublicReport API Error]', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        await prisma.$disconnect();
    }
};

// GET /api/reports/daily/:date
const getReportByDateHandler = async (req, res) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { date } = req.params; // Expects "YYYY-MM-DD" or "MM. DD."
    
    try {
        // Normalize date to YYYY-MM-DD for file path
        let formattedDate = date;
        if (date.includes('. ')) {
            const parts = date.split('. ').map(v => v.replace('.', '').padStart(2, '0'));
            formattedDate = `${new Date().getFullYear()}-${parts[0]}-${parts[1]}`;
        }

        const datePath = path.join(VIP_LOGS_DIR, `${formattedDate}.json`);
        const result = await fetchReportData(prisma, datePath, date);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[PublicReport Date API Error]', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        await prisma.$disconnect();
    }
};

router.get('/latest', getLatestReportHandler);
router.get('/:date', getReportByDateHandler);

module.exports = { router, getLatestReportHandler, getReportByDateHandler };
