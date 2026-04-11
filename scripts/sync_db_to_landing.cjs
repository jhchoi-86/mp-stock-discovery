const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
    console.log('[Landing-Sync] Starting DB to Landing Page Sync...');
    try {
        const latestEntry = await prisma.dailyTop5.findFirst({
            orderBy: { date: 'desc' },
            select: { date: true }
        });

        if (!latestEntry) {
            console.error('No data found in DailyTop5 table.');
            return;
        }

        const latestDate = latestEntry.date;
        console.log(`[Landing-Sync] Latest date found: ${latestDate}`);

        const top5 = await prisma.dailyTop5.findMany({
            where: { date: latestDate },
            orderBy: { score: 'desc' },
            take: 5
        });

        if (top5.length === 0) {
            console.error(`No stocks found for date ${latestDate}.`);
            return;
        }

        const finalData = {
            updatedAt: new Date().toISOString(),
            date: latestDate,
            stocks: top5.map(s => ({
                name: s.name,
                code: s.code,
                score: s.score,
                category: s.trend_type || '분석 중',
                adx: 0, 
                entryPrice1: s.entry_price_1,
                entryPrice2: s.entry_price_2,
                targetPrice: s.target_price_1,
                targetPrice2: Math.round(s.target_price_1 * 1.05),
                stopLoss: s.stop_loss,
                currentPrice: s.current_price,
                isNew: true
            }))
        };

        const DATA_DIR = path.join(__dirname, '..', 'data');
        const OUTPUT_FILE = path.join(DATA_DIR, 'landing_strategy.json');
        
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`[Landing-Sync] SUCCESS. Updated landing_strategy.json with ${top5.length} stocks from ${latestDate}`);

        // [v7.9.7] Archive to vip_logs as well to keep everything synced
        const VIP_DIR = path.join(DATA_DIR, 'vip_logs');
        if (!fs.existsSync(VIP_DIR)) fs.mkdirSync(VIP_DIR, { recursive: true });
        const LATEST_JSON = path.join(VIP_DIR, 'latest.json');
        fs.writeFileSync(LATEST_JSON, JSON.stringify(finalData, null, 2));
        console.log(`[Landing-Sync] Also updated legacy latest.json for broad compatibility.`);

    } catch (e) {
        console.error('[Landing-Sync] ERROR:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
