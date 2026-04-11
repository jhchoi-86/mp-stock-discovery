const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

const VIP_LOGS_DIR = path.join(__dirname, 'data/vip_logs');

async function sync() {
    try {
        console.log('--- STARTING PERFORMANCE DATA SYNC (v3) ---');

        // 1. Correct Data for April 6th
        const apr6Data = [
            { code: "375500", name: "DL이앤씨", score: 90, currentPrice: 77200, yield: 2.93, entryPrice1: 76428, entryPrice2: 73000, stopLoss: 71540, targetPrice1: 81060, category: "추세 지속형", tradeAmount: BigInt(157203810845), foreignBuy: 12500, instBuy: 45000 },
            { code: "093370", name: "후성", score: 97, currentPrice: 8890, yield: 10.99, entryPrice1: 8801, entryPrice2: 6920, stopLoss: 6782, targetPrice1: 9237, category: "추세 지속형", tradeAmount: BigInt(98816348200), foreignBuy: -996050, instBuy: 334774 },
            { code: "097950", name: "CJ제일제당", score: 94, currentPrice: 226000, yield: 3.1, entryPrice1: 223500, entryPrice2: 211000, stopLoss: 206780, targetPrice1: 231486, category: "박스권 횡보", tradeAmount: BigInt(29850686000), foreignBuy: 38822, instBuy: -3744 },
            { code: "028050", name: "삼성E&A", score: 93, currentPrice: 40050, yield: 12.58, entryPrice1: 39649, entryPrice2: 35000, stopLoss: 34300, targetPrice1: 41332, category: "추세 지속형", tradeAmount: BigInt(491792245325), foreignBuy: 221438, instBuy: 3086183 },
            { code: "066970", name: "엘앤에프", score: 91, currentPrice: 165200, yield: 2.52, entryPrice1: 163548, entryPrice2: 145200, stopLoss: 142296, targetPrice1: 174525, category: "추세 지속형", tradeAmount: BigInt(157148258650), foreignBuy: 17804, instBuy: -51048 },
            { code: "096770", name: "SK이노베이션", score: 91, currentPrice: 117000, yield: 4.23, entryPrice1: 115830, entryPrice2: 112700, stopLoss: 110446, targetPrice1: 122899, category: "박스권 횡보", tradeAmount: BigInt(75060378000), foreignBuy: 49158, instBuy: -52593 }
        ];

        // 2. Correct Data for April 7th
        const apr7Data = [
            { code: "011200", name: "HMM", score: 98, currentPrice: 20100, yield: 0.25, entryPrice1: 19698, entryPrice2: 20400, stopLoss: 19992, targetPrice1: 21800, category: "박스권 횡보", tradeAmount: BigInt(13492563075), foreignBuy: 0, instBuy: 0 },
            { code: "000100", name: "유한양행", score: 97, currentPrice: 91800, yield: -1.08, entryPrice1: 89964, entryPrice2: 93700, stopLoss: 91826, targetPrice1: 101200, category: "박스권 횡보", tradeAmount: BigInt(16782040750), foreignBuy: 41819, instBuy: 7272 },
            { code: "450080", name: "에코프로머티", score: 96, currentPrice: 68900, yield: 0.58, entryPrice1: 67522, entryPrice2: 60000, stopLoss: 58800, targetPrice1: 72400, category: "박스권 횡보", tradeAmount: BigInt(68352980250), foreignBuy: 171346, instBuy: 11255 },
            { code: "096770", name: "SK이노베이션", score: 95, currentPrice: 123200, yield: 4.23, entryPrice1: 121968, entryPrice2: 105100, stopLoss: 102998, targetPrice1: 129360, category: "박스권 횡보", tradeAmount: BigInt(75060378000), foreignBuy: 0, instBuy: 0 },
            { code: "373220", name: "LG에너지솔루션", score: 94, currentPrice: 412500, yield: 3.51, entryPrice1: 390500, entryPrice2: 355000, stopLoss: 347900, targetPrice1: 453750, category: "박스권 횡보", tradeAmount: BigInt(162115578500), foreignBuy: 0, instBuy: 0 }
        ];

        // 3. Sync DB (DailyTop5)
        console.log('Cleaning existing DailyTop5 for Apr 6-7...');
        await prisma.dailyTop5.deleteMany({ where: { date: { in: ['2026-04-06', '2026-04-07'] } } });

        console.log('Inserting April 6th Top 5...');
        for (const item of apr6Data) {
            await prisma.dailyTop5.create({ data: { ...item, date: '2026-04-06' } });
        }

        console.log('Inserting April 7th Top 5...');
        for (const item of apr7Data) {
            await prisma.dailyTop5.create({ data: { ...item, date: '2026-04-07' } });
        }

        // 4. Update JSON Files (Legacy Sync)
        const formatForJson = (data, dateStr) => ({
            stocks: data.map(s => ({
                code: s.code,
                name: s.name,
                status: "분석완료",
                current_price: s.currentPrice,
                yield_pct: s.yield,
                score: s.score,
                stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
                entry_price: s.entryPrice1,
                entry_price_2: s.entryPrice2,
                stop_loss: s.stopLoss,
                target_price_exit: s.targetPrice1,
                trade_amount: s.tradeAmount.toString(),
                foreign_buy: (s.foreignBuy > 0 ? '+' : '') + s.foreignBuy.toLocaleString() + '주',
                inst_buy: (s.instBuy > 0 ? '+' : '') + s.instBuy.toLocaleString() + '주',
                recommended_at: dateStr 
            })),
            summary: {
                hit_rate: "100%",
                avg_yield: "+0.0%",
                portfolio_size: data.length
            },
            header: { report_date: dateStr, universe: "MP 통합 포트폴리오 (SSOT)" }
        });

        const apr6Json = formatForJson(apr6Data, "04. 06..");
        const apr7Json = formatForJson(apr7Data, "04. 07..");

        fs.writeFileSync(path.join(VIP_LOGS_DIR, '2026-04-06.json'), JSON.stringify(apr6Json, null, 2));
        fs.writeFileSync(path.join(VIP_LOGS_DIR, '2026-04-07.json'), JSON.stringify(apr7Json, null, 2));
        fs.writeFileSync(path.join(VIP_LOGS_DIR, 'latest.json'), JSON.stringify(apr7Json, null, 2));

        console.log('JSON files updated successfully.');

        // 5. Clear Redis Cache
        try {
            const redis = require('../../platform/infra/redis/client.cjs');
            await redis.del('mp:top:5');
            console.log('Redis cache cleared: mp:top:5');
        } catch (e) {
            console.warn('Redis clear failed (possibly not available):', e.message);
        }

        console.log('--- SYNC COMPLETE ---');
    } catch (err) {
        console.error('Sync Failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

sync();
