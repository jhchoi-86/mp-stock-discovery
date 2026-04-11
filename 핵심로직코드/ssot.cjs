/**
 * [Phase 4-1] SSOT API Router (PostgreSQL/Prisma)
 * Provides Single Source of Truth for Web Dashboard
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cache = require('../services/cacheService.cjs');
const redis = require('../../platform/infra/redis/client.cjs');

/**
 * GET /api/ssot/top/:n - Top N 종목 11대 지표 조회
 * B-ERR-01 보정: Redis 캐시 레이어 적용
 */
router.get('/top/:n', async (req, res) => {
    const n = Math.min(parseInt(req.params.n) || 5, 20); // 최대 20
    const cacheKey = `mp:top:${n}`;

    try {
        // 1. Redis 캐시 조회 (R-MISS-02 보정)
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log(`[SSOT-API] Cache Hit: ${cacheKey}`);
            return res.json({ source: 'cache', data: JSON.parse(cached) });
        }

        // 2. Read specific latest recommended codes from latest.json (if available)
        const fs = require('fs');
        const path = require('path');
        let targetCodes = [];
        let reportDataMap = {};
        try {
            const latestPath = path.join(__dirname, '../../data/vip_logs/latest.json');
            if (fs.existsSync(latestPath)) {
                const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                if (report.stocks && report.stocks.length > 0) {
                    targetCodes = report.stocks.slice(0, n).map(s => s.code);
                    report.stocks.slice(0, n).forEach(s => { reportDataMap[s.code] = s; });
                }
            }
        } catch (e) {
            console.error('[SSOT-API] Failed to parse latest.json', e.message);
        }

        // 3. DB 조회 (캐시 미스)
        console.log(`[SSOT-API] Cache Miss: ${cacheKey}. Fetching from PostgreSQL...`);
        let rows = [];
        if (targetCodes.length > 0) {
            for (const code of targetCodes) {
                const snapshot = await prisma.dailyStockSnapshot.findFirst({
                    where: { code: code },
                    orderBy: { createdAt: 'desc' }
                });
                if (snapshot) rows.push(snapshot);
            }
        } else {
            // Fallback: highest scored ever (Legacy behavior)
            rows = await prisma.dailyStockSnapshot.findMany({
                where: { score: { gt: 0 } },
                orderBy: [
                    { score: 'desc' },
                    { createdAt: 'desc' }
                ],
                take: n
            });
        }

        // 3. 필드명 정규화 (Frontend 호환성)
        const normalizedRows = rows.map(r => {
            const merged = reportDataMap[r.code] || {};
            const finalScore = merged.score || r.score || 0;
            return {
                stock_code: r.code,
                stock_name: r.name,
                current_price: r.currentPrice || merged.current_price || 0,
                change_rate: r.yield || merged.yield_pct || 0,
                trade_amount: r.tradeAmount ? r.tradeAmount.toString() : '0',
                trend_type: r.trend || merged.trend_type || null,
                trend_strength: finalScore >= 85 ? '강함' : (finalScore >= 75 ? '보통' : '약함'),
                star_grade: finalScore,
                entry_price_1: merged.entry_price || r.entryPrice1,
                entry_price_2: merged.entry_price_2 || r.entryPrice2,
                stop_loss: merged.stop_loss || r.stopLoss,
                target_price_1: merged.target_price_exit || r.targetPrice1,
                target_price_2: r.targetPrice2,
                updated_at: r.createdAt
            };
        });

        // 4. Write-through 캐시 적재 (30분 TTL)
        await redis.setex(cacheKey, 30 * 60, JSON.stringify(normalizedRows));

        res.json({ source: 'db', data: normalizedRows });
    } catch (err) {
        console.error('[SSOT-API] Error:', err.message);
        res.status(500).json({ error: 'SSOT 데이터 동기화 실패' });
    }
});

module.exports = router;
