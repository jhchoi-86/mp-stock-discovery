/**
 * [Phase 4-1] SSOT API Router (PostgreSQL/Prisma)
 * Provides Single Source of Truth for Web Dashboard (Unified v8.1.0)
 */
const express = require('express');
const router = express.Router();
const prisma = require('./src/utils/prismaClient.cjs');
const { getGrade } = require('./src/utils/scoreEngine.cjs');

let redisClient = null;
try {
    redisClient = require('../../platform/infra/redis/client.cjs');
} catch (e) {
    console.warn('[SSOT-API] Redis unavailable, cache disabled:', e.message);
}

const CACHE_TTL = parseInt(process.env.SSOT_CACHE_TTL) || 600; // 10 minutes default

/**
 * GET /api/ssot/top/:n - Top N 종목 11대 지표 조회
 * Unifies DailyTop5 table as the primary SSOT for daily results.
 */
router.get('/top/:n', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const n = Math.min(parseInt(req.params.n) || 5, 20);
    const cacheKey = `mp:top:${n}`;

    try {
        // 1. Redis 캐시 조회 (O01)
        let cached = null;
        if (redisClient) {
            try {
                cached = await redisClient.get(cacheKey);
            } catch (rErr) {
                console.warn(`[SSOT-API] Redis get error: ${rErr.message}`);
            }
        }

        if (cached) {
            console.log(`[SSOT-API] Cache Hit: ${cacheKey}`);
            return res.json({ source: 'cache', data: JSON.parse(cached) });
        }

        // [v8.5.5 TASK-O02] KST Day Boundary fix (+9h)
        const todayStr = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
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
                distinct: ['code'], // [TASK-O03] Prevent cross-day duplicates
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
                star_grade: String(r.starGrade || getGrade(r.score)), // [TASK-O04] Centralized grading
                entry_price_1: r.entryPrice1,
                entry_price_2: r.entryPrice2,
                stop_loss: r.stopLoss,
                target_price_1: r.targetPrice1,
                target_price_2: r.targetPrice2 || 0,
                // [v8.3.2] Adding supply data back to SSOT response
                foreign_buy: r.foreignBuy || 0,
                inst_buy: r.instBuy || 0,
                updated_at: r.createdAt
            };
        });

        // 5. Write-through 캐시 적재 (O01/O05)
        if (redisClient) {
            try {
                await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(normalizedRows));
            } catch (sErr) {
                console.warn(`[SSOT-API] Redis setex error: ${sErr.message}`);
            }
        }

        res.json({ source: source, data: normalizedRows });
    } catch (err) {
        console.error('[SSOT-API] Error:', err.message);
        res.status(500).json({ error: 'SSOT 데이터 동기화 실패' });
    }
});

module.exports = router;
