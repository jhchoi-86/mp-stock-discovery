/**
 * [Red Team Warm-up]
 * 블루팀이 누락한 초기 캐시 적재(Warm-up)를 직접 수행하여 
 * DB와 Redis 간의 정합성을 100%로 맞춥니다.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cache = require('../src/services/cacheService.cjs');

async function runWarmup() {
    console.log('🛡 [Red Team] Starting Redis Cache Warm-up...');
    try {
        // 상위 350종목 (전체 universe) 지표 조회
        const rows = await prisma.dailyStockSnapshot.findMany({
            where: { star_grade: { gt: 0 } }
        });

        console.log(`🛡 [Red Team] Found ${rows.length} stocks to warm up.`);

        for (const r of rows) {
            await cache.setSignalReport(r.code, {
                current_price: Number(r.currentPrice || 0),
                change_rate: Number(r.yield || 0),
                trade_amount: String(r.tradeAmount || '0'),
                trend_type: r.trend_type || '횡보',
                trend_strength: Number(r.trend_strength || 0),
                star_grade: r.star_grade || 0,
                entry_price_1: Number(r.entry_price_1 || 0),
                entry_price_2: Number(r.entry_price_2 || 0),
                stop_loss: Number(r.stopLoss || 0),
                target_price_1: Number(r.target_price_1 || 0),
                target_price_2: Number(r.targetPrice2 || 0)
            });
        }

        console.log('🛡 [Red Team] Cache Warm-up Completed successfully.');
    } catch (err) {
        console.error('🛡 [Red Team] Warm-up Failed:', err.message);
    }
    process.exit(0);
}

runWarmup();
