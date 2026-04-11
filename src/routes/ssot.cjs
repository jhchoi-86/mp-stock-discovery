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
const { getKstDateString, getKstNow } = require('../utils/kst.cjs');

/**
 * GET /api/ssot/top/:n - Top N 종목 11대 지표 조회
 * B-ERR-01 보정: Redis 캐시 레이어 적용
 */
router.get('/top/:n', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const n = Math.min(parseInt(req.params.n) || 5, 20); 
    const cacheKey = `mp:top:${n}`;

    try {
        // 1. Redis 캐시 조회 (R-MISS-02 보정)
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log(`[SSOT-API] Cache Hit: ${cacheKey}`);
            return res.json({ source: 'cache', data: JSON.parse(cached) });
        }

        // 2. [v9.2.0] Safety-First Date Selection (Ghost Prevention)
        // [RED TEAM] 절대 미래의 날짜(오설정/유령 데이터)가 노출되지 않도록 '오늘 이하'로 날짜를 제한합니다.
        const todayStr = getKstDateString();

        const latestEntry = await prisma.dailyTop5.findFirst({
            where: { date: { lte: todayStr } }, // [GHOST FIX] 미래 데이터 차단
            orderBy: { date: 'desc' }
        });
        
        const latestDate = latestEntry ? latestEntry.date : todayStr;

        const latestTopEntries = await prisma.dailyTop5.findMany({
            where: { date: latestDate },
            orderBy: { score: 'desc' },
            take: n
        });

        const targetCodes = latestTopEntries.map(e => e.code);

        // 3. 필드 데이터 조회 (DailyStockSnapshot 또는 DailyTop5 데이터 활용)
        // 정합성을 위해 DailyStockSnapshot의 최신 스냅샷을 우선 참조합니다.
        let rows = [];
        for (const entry of latestTopEntries) {
            const snapshot = await prisma.dailyStockSnapshot.findFirst({
                where: { code: entry.code },
                orderBy: { createdAt: 'desc' }
            });

            // [v9.1.10 SSOT Fix] Merging logic for data integrity
            // Prioritize snapshot for live technicals (price, yield etc), 
            // but keep entry as primary source for strategic selection fields.
            if (snapshot) {
                // Ensure strategic metadata from Top5 entry is preserved
                rows.push({
                    ...snapshot,
                    // Strategic fields from Top 5 table (Saved by publishToAll/SyncSave)
                    score: entry.score || snapshot.score,
                    aiComment: entry.aiComment || snapshot.aiComment,
                    styleTag: entry.styleTag || snapshot.styleTag,
                    volRate: entry.volRate || snapshot.volRate || 0,
                    // Type-safe supply data handling
                    foreignBuy: (snapshot.foreignBuy && snapshot.foreignBuy !== '0') ? snapshot.foreignBuy : (entry.foreignBuy ? String(entry.foreignBuy) : '0'),
                    instBuy: (snapshot.instBuy && snapshot.instBuy !== '0') ? snapshot.instBuy : (entry.instBuy ? String(entry.instBuy) : '0')
                });
            } else {
                rows.push(entry);
            }
        }

        // Fallback: 만약 Top5 테이블이 비어있으면 스코어 순으로 가져옴
        if (rows.length === 0) {
            rows = await prisma.dailyStockSnapshot.findMany({
                where: { score: { gt: 0 } },
                orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
                take: n
            });
        }

        // 4. 필드명 정규화 (Frontend 호환성)
        const normalizedRows = rows.map(r => {
            const entryTarget = r.entryPrice1 || 0;
            const stopTarget = r.stopLoss || 0;
            const profitTarget = r.targetPrice1 || 0;
            const curPrice = r.currentPrice || 0;
            const dOpen = r.dailyOpen || 0;
            const dHigh = r.dailyHigh || 0;
            const dLow = r.dailyLow || 0;

            let status = "진입 대기";
            if (entryTarget > 0) {
                const hasEntered = dLow > 0 && dLow <= entryTarget;
                if (hasEntered) {
                    status = "보유 중";
                    const isStopHit = dLow > 0 && dLow <= stopTarget;
                    const isTargetHit = dHigh > 0 && dHigh >= profitTarget;
                    if (isStopHit) status = "손절 완료";
                    else if (isTargetHit) status = "목표 도달";
                }
            }

            return {
                stock_code: r.code,
                stock_name: (r.name || '').replace(/^TEST_/, ''),
                current_price: curPrice,
                change_rate: r.yield || 0,
                score: r.score || 0,
                trade_amount: r.tradeAmount ? r.tradeAmount.toString() : '0',
                vol_ratio: r.volRate ? `${parseFloat(r.volRate).toFixed(2)}%` : '0.00%',
                foreign_buy: String(r.foreignBuy || '0'),
                inst_buy: String(r.instBuy || '0'),
                trend_type: r.category || '분석 중',
                trend_strength: String(r.adx || '0'), 
                star_grade: String(Math.ceil((r.score || 0) / 20)) || '3', 
                entry_price_1: entryTarget,
                entry_price_2: r.entryPrice2 || 0,
                stop_loss: stopTarget,
                target_price_1: profitTarget,
                target_price_2: r.targetPrice2 || 0,
                style_tag: r.styleTag || null,
                ai_comment: r.aiComment || null,
                status: status,
                updated_at: r.createdAt
            };
        });

        // 5. Write-through 캐시 적재 (1분 TTL로 단축 - 실시간성 강화)
        await redis.setex(cacheKey, 60, JSON.stringify(normalizedRows));

        res.json({ source: 'db', data: normalizedRows });
    } catch (err) {
        console.error('[SSOT-API] Error:', err.message);
        res.status(500).json({ error: 'SSOT 데이터 동기화 실패' });
    }
});

module.exports = router;
