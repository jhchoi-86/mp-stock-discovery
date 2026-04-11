const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('../platform/infra/redis/client.cjs');

async function debug() {
    console.log('[DEBUG-SSOT] 정밀 대조 시작...');
    
    const db = await prisma.dailyStockSnapshot.findFirst({ 
        where: { code: '028050' } // 삼성E&A
    });
    
    const rd = await redis.get('mp:signal:028050');
    const cached = rd ? JSON.parse(rd) : null;

    console.log('--- 삼성E&A (028050) ---');
    console.log('DB Data Type:', {
        price: typeof db.currentPrice,
        entry: typeof db.entry_price_1,
        sl: typeof db.stop_loss,
        target: typeof db.target_price_1
    });
    console.log('DB Values:', {
        p: db.currentPrice,
        e: db.entry_price_1,
        s: db.stop_loss,
        t: db.target_price_1
    });

    if (cached) {
        console.log('RD Data Type:', {
            price: typeof cached.current_price,
            entry: typeof cached.entry_price_1,
            sl: typeof cached.stop_loss,
            target: typeof cached.target_price_1
        });
        console.log('RD Values:', {
            p: cached.current_price,
            e: cached.entry_price_1,
            s: cached.stop_loss,
            t: cached.target_price_1
        });
    } else {
        console.log('RD: MISS');
    }

    process.exit(0);
}

debug();
