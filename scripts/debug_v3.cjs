const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('../platform/infra/redis/client.cjs');
const axios = require('axios');

async function debug() {
    console.log('[DEBUG-SSOT-V3] Starting CheckSum...');
    const issues = [];
    
    try {
        const dbRows = await prisma.dailyStockSnapshot.findMany({
            where: { star_grade: { gt: 0 } },
            orderBy: { star_grade: 'desc' },
            take: 10
        });

        for (const row of dbRows) {
            const cacheKey = 'mp:signal:' + row.code;
            const cached = await redis.get(cacheKey);
            if (!cached) continue;
            const c = JSON.parse(cached);

            const comps = [
                { l: 'CP', d: Number(row.currentPrice || 0), c: Number(c.current_price || 0) },
                { l: 'EP1', d: Number(row.entry_price_1 || 0), c: Number(c.entry_price_1 || 0) },
                { l: 'SL', d: Number(row.stopLoss || 0), c: Math.round(Number(c.stop_loss || 0)) },
                { l: 'TP1', d: Number(row.target_price_1 || 0), c: Number(c.target_price_1 || 0) }
            ];

            for (const item of comps) {
                if (item.d != item.c) {
                    console.log(`  [MISMATCH-RD] ${row.code} ${item.l}: DB=${item.d} RD=${item.c}`);
                    issues.push('RD-ERR');
                }
            }
        }

        const apiRes = await axios.get('http://localhost:3001/api/ssot/top/5');
        const apiData = apiRes.data.data || [];
        for (const a of apiData) {
            const d = dbRows.find(r => r.code === a.stock_code);
            if (d && Number(a.entry_price_1) != Number(d.entry_price_1)) {
                console.log(`  [MISMATCH-API] ${a.stock_code} EP1: API=${a.entry_price_1} DB=${d.entry_price_1}`);
                issues.push('API-ERR');
            }
        }
    } catch (e) {
        console.error('ERROR:', e.message);
    }

    console.log(`[RESULT] Issues: ${issues.length}`);
    process.exit(0);
}

debug();
