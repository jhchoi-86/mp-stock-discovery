const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const Redis = require('ioredis');
const redis = new Redis();

async function main() {
    const date = '2026-04-06';
    
    const finalData = [
        { 
            code: '093370', name: '후성', score: 97, 
            price: 8890, change: 10.99, cat: '추세 지속형',
            e1: 8801, e2: 6920, sl: 6782, t1: 9237, 
            trade: '98816348200', for: -996050, inst: 334774 
        },
        { 
            code: '097950', name: 'CJ제일제당', score: 94, 
            price: 226000, change: 3.10, cat: '박스권 횡보',
            e1: 223500, e2: 211000, sl: 206780, t1: 231486, 
            trade: '29850686000', for: 38822, inst: -3744 
        },
        { 
            code: '028050', name: '삼성E&A', score: 93, 
            price: 40050, change: 12.58, cat: '추세 지속형',
            e1: 39649, e2: 35000, sl: 34300, t1: 41332, 
            trade: '491792245325', for: 221438, inst: 3086183 
        },
        { 
            code: '066970', name: '엘앤에프', score: 91, 
            price: 165200, change: 2.52, cat: '추세 지속형',
            e1: 163548, e2: 145200, sl: 142296, t1: 174525, 
            trade: '157148258650', for: 17804, inst: -51048 
        },
        { 
            code: '096770', name: 'SK이노베이션', score: 91, 
            price: 117000, change: 4.23, cat: '박스권 횡보',
            e1: 115830, e2: 112700, sl: 110446, t1: 122899, 
            trade: '75060378000', for: 49158, inst: -52593 
        },
        { 
            code: '375500', name: 'DL이앤씨', score: 90, 
            price: 77200, change: 2.93, cat: '추세 지속형',
            e1: 76428, e2: 73000, sl: 71540, t1: 81060, 
            trade: '157203810845', for: 12500, inst: 45000 
        }
    ];

    console.log(`[V3] Cleaning items for ${date}...`);
    await prisma.dailyTop5.deleteMany({ where: { date } });

    console.log(`[V3] Inserting ${finalData.length} stocks with high scores and full supply data...`);
    for (const d of finalData) {
        await prisma.dailyTop5.create({
            data: {
                date,
                code: d.code,
                name: d.name,
                score: d.score,
                currentPrice: d.price,
                yield: d.change,
                category: d.cat,
                entryPrice1: d.e1,
                entryPrice2: d.e2,
                stopLoss: d.sl,
                targetPrice1: d.t1,
                tradeAmount: d.trade,
                foreignBuy: d.for,
                instBuy: d.inst,
                createdAt: new Date()
            }
        });
    }

    console.log('[V3] Deep-clearing Redis cache...');
    const keys = ['mp:top:5', 'mp:top:10', 'mp:top:20'];
    for (const k of keys) {
        await redis.del(k);
    }
    
    console.log('[V3] Done. Top 5 + DL이앤씨 restored with full supply data.');
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
