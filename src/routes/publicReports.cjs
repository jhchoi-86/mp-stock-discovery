const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const VIP_LOGS_DIR = path.join(__dirname, '../../data/vip_logs');

const { getFullPriceCache } = require('../utils/fullUniversePoller.cjs');
const { enrichWithManualPrices } = require('../utils/manualPriceEnricher.cjs'); // [v9.4.32] Dynamic Price Enrichment
const { PrismaClient } = require('@prisma/client'); // Required for standalone prisma usage

// Ensure directory exists
if (!fs.existsSync(VIP_LOGS_DIR)) {
    fs.mkdirSync(VIP_LOGS_DIR, { recursive: true });
}

/**
 * fetchReportData - SSOT 통합 데이터 조회 로직
 */
const fetchReportData = async (prisma, filePath, fallbackDate = null) => {
    let stocks = [];
    let header = { report_date: '' };

    // 0. Try reading from SyncSaveLog (Landing Snapshot SSOT)
    // fallbackDate looks like "2026-04-12 13:08" or "04. 12."
    if (fallbackDate && (fallbackDate.includes(':') || fallbackDate.includes(' '))) {
        try {
            const latestSync = await prisma.syncSaveLog.findFirst({
                where: { tagName: { contains: fallbackDate } },
                orderBy: { timestamp: 'desc' }
            });

            if (latestSync && Array.isArray(latestSync.snapshot)) {
                stocks = latestSync.snapshot.map(s => ({
                    code: s.code,
                    name: s.name,
                    current_price: s.currentPrice,
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
                    trade_amount: (s.tradeAmount || 0).toString(),
                    foreign_buy: (s.foreignBuy > 0 ? '+' : '') + (s.foreignBuy || 0).toLocaleString() + '주',
                    inst_buy: (s.instBuy > 0 ? '+' : '') + (s.instBuy || 0).toLocaleString() + '주',
                    recommended_at: (latestSync.tagName || '').split(' ')[0].split('-').slice(1).join('. ') + '.'
                }));
                header.report_date = (latestSync.tagName || '').split(' ')[0].split('-').slice(1).join('. ') + '..';
                
                // [v9.4.32] Enrich snapshot with latest manual prices
                const enrichedStocks = await enrichWithManualPrices(stocks, prisma, latestSync.savedAt);
                return { stocks: enrichedStocks, header, source: 'sync_save_log', tagName: latestSync.tagName };
            }
        } catch (e) {
            console.error('[PublicReport] SyncSaveLog Error:', e.message);
        }
    }

    // 1. Try reading from DailyTop5 table (Standard Daily SSOT)
    if (fallbackDate) {
        try {
            let dbDate = fallbackDate;
            if (fallbackDate.includes('. ')) {
                const parts = fallbackDate.split('. ').map(v => v.replace('.', '').padStart(2, '0'));
                dbDate = `${new Date().getFullYear()}-${parts[0]}-${parts[1]}`;
            } else if (fallbackDate.includes(' ')) {
                // If tag is "2026-04-12 13:08", extract "2026-04-12"
                dbDate = fallbackDate.split(' ')[0];
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

    // 2. Try JSON file fallback (Legacy)
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

    return { stocks, header, source: 'empty' };
};

// Handlers (Prisma closure optimization)
const getLatestReportHandler = async (req, res) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
        const latestPath = path.join(VIP_LOGS_DIR, 'latest.json');
        const result = await fetchReportData(prisma, latestPath);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[PublicReport API Error]', error);
        res.status(500).json({ success: false, error: 'Internal server error', stocks: [], header: {} });
    } finally {
        await prisma.$disconnect();
    }
};

const getReportByDateHandler = async (req, res) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
        const { date } = req.params;
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
        res.status(500).json({ success: false, error: 'Internal server error', stocks: [], header: {} });
    } finally {
        await prisma.$disconnect();
    }
};

router.get('/latest', getLatestReportHandler);
router.get('/:date', getReportByDateHandler);

module.exports = { router, getLatestReportHandler, getReportByDateHandler };
