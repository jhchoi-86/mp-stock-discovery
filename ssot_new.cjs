/**
 * [Phase 4-1] SSOT API Router (PostgreSQL/Prisma)
 * Provides Single Source of Truth for Web Dashboard (Unified v8.1.0)
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('../../platform/infra/redis/client.cjs');

/**
 * GET /api/ssot/top/:n - Top N 종목 11대 지표 조회
 * Unifies DailyTop5 table as the primary SSOT for daily results.
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

        const todayStr = new Date().toISOString().split('T')[0];
        console.log(`[SSOT-API] Cache Miss: ${cacheKey}. Checking DailyTop5 for ${todayStr}...`);

        // 2. Primary Source: DailyTop5 (The current day's finalized results)
        let top5Records = await prisma.dailyTop5.findMany({
            where: { date: todayStr },
            orderBy: { score: 'desc' },
            take: n
        });

        let source = 'DailyTop5';
        let rows = top5Records;

        // 3. Fallback Source: DailyStockSnapshot (If DailyTop5 not yet populated for today)
        if (rows.length === 0) {
            console.log(`[SSOT-API] No DailyTop5 found for ${todayStr}. Falling back to DailyStockSnapshot.`);
            source = 'DailyStockSnapshot';
            rows = await prisma.dailyStockSnapshot.findMany({
                where: { score: { gt: 0 } },
                orderBy: [
                    { score: 'desc' },
                    { createdAt: 'desc' }
                ],
                take: n
            });
        }

        // 4. 필드명 정규화 (Frontend Top5StrategyBanner.jsx 호환성)
        const normalizedRows = rows.map(r => {
            return {
                stock_code: r.code,
                stock_name: r.name,
                current_price: r.currentPrice,
                change_rate: r.yield,
                score: r.score,
                trade_amount: r.tradeAmount ? r.tradeAmount.toString() : '0',
                trend_type: r.category || null,
                trend_strength: r.trendStrength || String(r.adx || 0), 
                star_grade: String(r.starGrade || (r.score >= 80 ? '5' : (r.score >= 60 ? '4' : '3'))), 
                entry_price_1: r.entryPrice1,
                entry_price_2: r.entryPrice2,
                stop_loss: r.stopLoss,
                target_price_1: r.targetPrice1,
                target_price_2: r.targetPrice2 || 0,
                updated_at: r.createdAt
            };
        });

        // 5. Write-through 캐시 적재 (10분 TTL - Unification 시기에는 짧게 유지)
        await redis.setex(cacheKey, 10 * 60, JSON.stringify(normalizedRows));

        res.json({ source: source, data: normalizedRows });
    } catch (err) {
        console.error('[SSOT-API] Error:', err.message);
        res.status(500).json({ error: 'SSOT 데이터 동기화 실패' });
    }
});

module.exports = router;
