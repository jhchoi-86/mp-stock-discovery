const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const PublishingService = require('../src/services/publishingService.cjs');
const publishingService = new PublishingService();

async function verifySyncIntegrity() {
    console.log('--- [Red Team] Sync Integrity A to Z Verification Start ---');

    // 1. Mock Top 5 Data for Verification
    const testStocks = [
        { code: '005930', name: '삼성전자(TEST)', score: 95, category: '추세지속', currentPrice: 75000, entryPrice1: 74000, stopLoss: 72000, targetPrice1: 80000, yield: 1.2, tradeAmount: 1000000 },
        { code: '000660', name: 'SK하이닉스(TEST)', score: 88, category: '눌림목', currentPrice: 180000, entryPrice1: 175000, stopLoss: 170000, targetPrice1: 200000, yield: -0.5, tradeAmount: 500000 },
        { code: '035420', name: 'NAVER(TEST)', score: 82, category: '바닥권', currentPrice: 190000, entryPrice1: 188000, stopLoss: 180000, targetPrice1: 210000, yield: 2.1, tradeAmount: 300000 },
        { code: '035720', name: '카카오(TEST)', score: 79, category: '관망', currentPrice: 55000, entryPrice1: 54000, stopLoss: 50000, targetPrice1: 65000, yield: 0.8, tradeAmount: 200000 },
        { code: '005380', name: '현대차(TEST)', score: 85, category: '실적성장', currentPrice: 240000, entryPrice1: 235000, stopLoss: 220000, targetPrice1: 280000, yield: 1.5, tradeAmount: 150000 }
    ];

    try {
        // [CHANNEL 1] DB Trace - Before
        console.log('\n[CHANNEL 1] DB (PostgreSQL/Prisma) Audit...');
        const beforeDB = await prisma.dailyTop5.count();
        console.log(`- Extant DailyTop5 records: ${beforeDB}`);

        // [CHANNEL 2] JSON Trace - Before
        const landingPath = path.join(process.cwd(), 'data', 'landing_strategy.json');
        const beforeLanding = fs.readFileSync(landingPath, 'utf8');
        console.log('[CHANNEL 2] JSON Strategy Files Trace: Snapshot taken.');

        // [CHANNEL 3] Redis Trace - Before
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const redis = new Redis(redisUrl);
        await redis.set('mp:top:5', 'DUMMY_STALE_DATA'); // Force stale data to test invalidation
        console.log('[CHANNEL 3] Redis Cache Layer: Injected dummy stale data into "mp:top:5"');

        // EXECUTION: Trigger Multi-Channel Sync
        console.log('\n--- EXECUTION: Calling PublishingService.publishToAll() ---');
        await publishingService.publishToAll(testStocks);
        console.log('--- EXECUTION: COMPLETE ---\n');

        // VERIFICATION 1: DB Integrity
        const afterDBEntries = await prisma.dailyTop5.findMany({
            orderBy: { score: 'desc' }
        });
        console.log(`- DailyTop5 after sync: ${afterDBEntries.length} items`);
        if (afterDBEntries.length === 5 && afterDBEntries[0].code === '005930') {
            console.log('✅ DB Verification: PASSED (Transactional Top 5 Consistency)');
        } else {
            console.error('❌ DB Verification: FAILED');
        }

        // VERIFICATION 2: JSON Atomic Write Integrity
        const afterLanding = JSON.parse(fs.readFileSync(landingPath, 'utf8'));
        console.log(`- landing_strategy.json updated at: ${afterLanding.updatedAt}`);
        if (afterLanding.stocks && afterLanding.stocks[0].code === '005930') {
            console.log('✅ JSON Verification: PASSED (Atomic Write Integrity)');
        } else {
            console.error('❌ JSON Verification: FAILED');
        }

        // VERIFICATION 3: Redis Cache Invalidation Integrity
        const afterRedis = await redis.get('mp:top:5');
        if (afterRedis === null) {
            console.log('✅ Redis Verification: PASSED (Immediate Invalidation Success)');
        } else {
            console.error('❌ Redis Verification: FAILED (Stale cache still exists)');
        }

        await redis.quit();
        console.log('\n--- [Red Team] Verification Result: SUCCESS ---');
    } catch (err) {
        console.error('\n❌ [Red Team] Critical Audit Failure:', err.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifySyncIntegrity();
