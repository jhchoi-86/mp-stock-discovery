const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('[Restore] Correcting Top 5 Portfolio Alignment (L&F Inclusion / DL E&C as Interest)...');
    
    const todayStr = '2026-04-07';

    // 1. Define the TRUE Top 5 (Excluding DL이앤씨 which is Interest)
    const top5Stocks = [
        { code: '093370', name: '후성', score: 97, currentPrice: 8890, entryPrice1: 8801, entryPrice2: 6920, targetPrice1: 9237, stopLoss: 6782, category: '추세 지속형', tradeAmount: 98816348200n },
        { code: '097950', name: 'CJ제일제당', score: 94, currentPrice: 226000, entryPrice1: 223500, entryPrice2: 211000, targetPrice1: 231486, stopLoss: 206780, category: '박스권 횡보', tradeAmount: 29850686000n },
        { code: '028050', name: '삼성E&A', score: 93, currentPrice: 40050, entryPrice1: 39649, entryPrice2: 35000, targetPrice1: 41332, stopLoss: 34300, category: '추세 지속형', tradeAmount: 491792245325n },
        { code: '096770', name: 'SK이노베이션', score: 91, currentPrice: 117000, entryPrice1: 115830, entryPrice2: 112700, targetPrice1: 122899, stopLoss: 110446, category: '박스권 횡보', tradeAmount: 75060378000n },
        { code: '066970', name: '엘앤에프', score: 91, currentPrice: 165200, entryPrice1: 163548, entryPrice2: 145200, targetPrice1: 174525, stopLoss: 142296, category: '추세 지속형', tradeAmount: 157148258650n }
    ];

    // DL이앤씨 info for later if needed (Interest Stock)
    const dlInfo = { code: '375500', name: 'DL이앤씨', score: 90, currentPrice: 77200, entryPrice1: 76428, entryPrice2: 73000, targetPrice1: 81060, stopLoss: 71540, category: '추세 지속형', tradeAmount: 157203810845n };

    // 2. Clean up Today's DailyTop5
    await prisma.dailyTop5.deleteMany({ where: { date: todayStr } });
    console.log('[Restore] Cleared today\'s entries.');

    // 3. Insert Correct Top 5
    for (const s of top5Stocks) {
        await prisma.dailyTop5.create({
            data: {
                date: todayStr,
                code: s.code,
                name: s.name,
                score: s.score,
                currentPrice: s.currentPrice,
                yield: 0,
                entryPrice1: s.entryPrice1,
                entryPrice2: s.entryPrice2,
                targetPrice1: s.targetPrice1,
                stopLoss: s.stopLoss,
                category: s.category,
                tradeAmount: s.tradeAmount,
                foreignBuy: 0,
                instBuy: 0
            }
        });
        console.log(`[Restore] Inserted Top 5: ${s.name}`);
    }

    // 4. Update latest.json
    const reportDate = '04. 07..';
    const report = {
        stocks: top5Stocks.map(s => ({
            ...s,
            trade_amount: s.tradeAmount.toString(),
            yield_pct: 0,
            recommended_at: reportDate
        })),
        summary: {
           hit_rate: '100%',
           avg_yield: '0.0%',
           portfolio_size: top5Stocks.length
        },
        header: {
            report_date: reportDate,
            universe: 'MP 통합 포트폴리오 (SSOT)'
        }
    };
    
    const output = JSON.stringify(report, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    , 2);

    fs.writeFileSync(path.join(__dirname, 'data/vip_logs/latest.json'), output);
    fs.writeFileSync(path.join(__dirname, 'data/vip_logs/2026-04-07.json'), output);
    console.log('[Restore] Updated latest.json and 2026-04-07.json with Correct Top 5.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
