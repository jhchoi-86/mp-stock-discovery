const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('1. Deleting all DailyStockSnapshot data for 2026-04-05...');
        const delRes = await prisma.dailyStockSnapshot.deleteMany({
             where: {
                createdAt: {
                    gte: new Date('2026-04-04T15:00:00.000Z'),
                    lt: new Date('2026-04-05T15:00:00.000Z')
                }
             }
        });
        console.log(`Deleted records: ${delRes.count}`);

        const SIGNALS_FILE = path.join(process.cwd(), 'data', 'signals.json');
        if (fs.existsSync(SIGNALS_FILE)) {
            const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
            // Remove test stocks just in case
            const validSignals = signals.filter(s => s.code !== 'TEST_ERR' && s.code !== 'TEST_EXM');
            
            // Get unique stocks (using timeframe 1D or taking the first occurrence per code)
            const map = new Map();
            validSignals.forEach(s => {
                if (!map.has(s.code)) {
                    map.set(s.code, s);
                }
            });
            const filtered = Array.from(map.values());
            
            console.log(`2. Recreating data... (Target: ${filtered.length})`);
            
            const insertData = filtered.map(s => {
                 let tAmt = s.trade_amount || s.tradeAmount || 0;
                 if (s.kis_change_data && s.kis_change_data.trade_amount) tAmt = s.kis_change_data.trade_amount;
                 
                 let foreignBuy = '-';
                 let instBuy = '-';
                 if (s.kis_change_data) {
                     foreignBuy = s.kis_change_data.foreign_buy || '-';
                     instBuy = s.kis_change_data.inst_buy || '-';
                 }

                 return {
                    code: s.code, 
                    name: s.name || s.code,
                    currentPrice: parseFloat(s.current_price || s.currentPrice || 0), 
                    yield: parseFloat(s.change_rate || s.yield || 0),
                    score: parseInt(s.score || s.total_score || 0), 
                    entryPrice1: parseFloat(s.entry_price || s.entryPrice1 || 0), 
                    entryPrice2: parseFloat(s.entry_price_2 || s.entryPrice2 || 0),
                    targetPrice1: parseFloat(s.target_price || s.bb_upper || 0), 
                    stopLoss: parseFloat(s.stop_loss || s.stopLoss || 0),
                    category: s.category || '스나이퍼 포착',
                    adx: parseInt(s.adx || 0),
                    ema5: parseFloat(s.ema5 || 0),
                    ema10: parseFloat(s.ema10 || 0),
                    ema20: parseFloat(s.ema20 || 0),
                    ema60: parseFloat(s.ema60 || 0),
                    tradeAmount: BigInt(tAmt),
                    foreignBuy: String(foreignBuy),
                    instBuy: String(instBuy),
                    createdAt: new Date('2026-04-05T09:00:00Z')
                 };
            });
            
            await prisma.dailyStockSnapshot.createMany({
                data: insertData,
                skipDuplicates: true
            });
            console.log(`Successfully inserted ${insertData.length} records!`);
        }
    } catch (e) {
        console.error('[Error]', e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
