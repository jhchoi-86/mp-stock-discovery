/**
 * [v9.3.4] SSOT API Router (PostgreSQL/Prisma)
 * Provides Single Source of Truth for Web Dashboard
 * Primary source: SyncSaveLog (latest Sync Save snapshot)
 * Fallback: DailyTop5 → DailyStockSnapshot
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('../../platform/infra/redis/client.cjs');
const { getKstDateString } = require('../utils/kst.cjs');

/**
 * GET /api/ssot/top/:n - Top N 종목 조회 (SyncSaveLog SSOT 우선)
 */
router.get('/top/:n', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const n = Math.min(parseInt(req.params.n) || 5, 20);
    const cacheKey = `mp:top:${n}`;

    try {
        // 1. Redis 캐시 조회
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log(`[SSOT-API] Cache Hit: ${cacheKey}`);
            return res.json({ source: 'cache', data: JSON.parse(cached) });
        }

        // 2. [v9.3.4] SyncSaveLog SSOT — 최근 동기화 저장 스냅샷 우선 사용
        const latestSync = await prisma.syncSaveLog.findFirst({
            orderBy: { savedAt: 'desc' }
        });

        let normalizedRows = [];

        if (latestSync && Array.isArray(latestSync.snapshot) && latestSync.snapshot.length > 0) {
            const stocks = latestSync.snapshot.slice(0, n);
            normalizedRows = stocks.map(s => ({
                stock_code: s.ticker || s.code,
                stock_name: (s.name || '').replace(/^TEST_/, ''),
                current_price: s.currentPrice || s.price || 0,
                change_rate: s.yield || 0,
                score: s.hybridScore || s.score || 0,
                trade_amount: s.tradeAmount ? String(s.tradeAmount) : '0',
                vol_ratio: '0.00%',
                foreign_buy: String(s.foreignNet || s.foreignBuy || '0'),
                inst_buy: String(s.institutionNet || s.instBuy || '0'),
                trend_type: s.category || '분석 중',
                trend_strength: '0',
                star_grade: String(Math.ceil((s.hybridScore || s.score || 0) / 20) || 3),
                entry_price_1: s.entry1Price || s.entryPrice1 || 0,
                entry_price_2: s.entry2Price || s.entryPrice2 || 0,
                stop_loss: s.stopLossPrice || s.stopLoss || 0,
                target_price_1: s.targetPrice || s.targetPrice1 || 0,
                target_price_2: 0,
                style_tag: s.styleTag || null,
                ai_comment: s.aiComment || null,
                status: '진입 대기',
                updated_at: latestSync.savedAt
            }));
        } else {
            // 3. Fallback: DailyTop5 → DailyStockSnapshot
            const todayStr = getKstDateString();
            const latestEntry = await prisma.dailyTop5.findFirst({
                where: { date: { lte: todayStr } },
                orderBy: { date: 'desc' }
            });
            const latestDate = latestEntry ? latestEntry.date : todayStr;
            const latestTopEntries = await prisma.dailyTop5.findMany({
                where: { date: latestDate },
                orderBy: { score: 'desc' },
                take: n
            });

            let rows = [];
            for (const entry of latestTopEntries) {
                const snapshot = await prisma.dailyStockSnapshot.findFirst({
                    where: { ticker: entry.code },
                    orderBy: { createdAt: 'desc' }
                });
                if (snapshot) {
                    rows.push({
                        ...snapshot,
                        score: entry.score || snapshot.hybridScore || snapshot.score,
                        aiComment: entry.aiComment || snapshot.aiComment,
                        styleTag: entry.styleTag || snapshot.styleTag,
                        foreignBuy: snapshot.foreignNet || snapshot.foreignBuy || String(entry.foreignBuy || '0'),
                        instBuy: snapshot.institutionNet || snapshot.instBuy || String(entry.instBuy || '0')
                    });
                } else {
                    rows.push(entry);
                }
            }

            if (rows.length === 0) {
                rows = await prisma.dailyStockSnapshot.findMany({
                    where: { hybridScore: { gt: 0 } },
                    orderBy: [{ hybridScore: 'desc' }, { createdAt: 'desc' }],
                    take: n
                });
            }

            normalizedRows = rows.map(r => ({
                stock_code: r.ticker || r.code,
                stock_name: (r.name || '').replace(/^TEST_/, ''),
                current_price: r.currentPrice || r.price || 0,
                change_rate: r.yield || 0,
                score: r.hybridScore || r.score || 0,
                trade_amount: r.tradeAmount ? r.tradeAmount.toString() : '0',
                vol_ratio: r.volRate ? `${parseFloat(r.volRate).toFixed(2)}%` : '0.00%',
                foreign_buy: String(r.foreignNet || r.foreignBuy || '0'),
                inst_buy: String(r.institutionNet || r.instBuy || '0'),
                trend_type: r.category || '분석 중',
                trend_strength: String(r.adx || '0'),
                star_grade: String(Math.ceil((r.hybridScore || r.score || 0) / 20)) || '3',
                entry_price_1: r.entry1Price || r.entryPrice1 || 0,
                entry_price_2: r.entry2Price || r.entryPrice2 || 0,
                stop_loss: r.stopLossPrice || r.stopLoss || 0,
                target_price_1: r.targetPrice || r.targetPrice1 || 0,
                target_price_2: 0,
                style_tag: r.styleTag || null,
                ai_comment: r.aiComment || null,
                status: '진입 대기',
                updated_at: r.createdAt
            }));
        }

        // 4. Write-through 캐시 (1분 TTL)
        if (normalizedRows.length > 0) {
            await redis.setex(cacheKey, 60, JSON.stringify(normalizedRows));
        }

        res.json({ source: 'db', data: normalizedRows });
    } catch (err) {
        console.error('[SSOT-API] Error:', err.message);
        res.status(500).json({ error: 'SSOT 데이터 동기화 실패' });
    }
});

module.exports = router;
