const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const date = '2026-04-06';
    
    const correctData = [
        { code: '093370', name: '후성', score: 97, price: 8890, change: 10.99, cat: '추세 지속형', entry1: 9440, entry2: 6920, sl: 6782, tp: 8797, trade: '98816348200' },
        { code: '097950', name: 'CJ제일제당', score: 94, price: 226000, change: 3.10, cat: '박스권 횡보', entry1: 224500, entry2: 211000, sl: 206780, tp: 231486, trade: '29850686000' },
        { code: '028050', name: '삼성E&A', score: 93, price: 40050, change: 12.58, cat: '추세 지속형', entry1: 42550, entry2: 35000, sl: 34300, tp: 41332, trade: '491792245325' },
        { code: '096770', name: 'SK이노베이션', score: 91, price: 117000, change: 4.23, cat: '박스권 횡보', entry1: 117800, entry2: 112700, sl: 110446, tp: 122899, trade: '75060378000' },
        { code: '066970', name: '엘앤에프', score: 87, price: 165200, change: 2.52, cat: '추세 지속형', entry1: 168600, entry2: 145200, sl: 142296, tp: 174525, trade: '157148258650' }
    ];

    console.log(`[Fix] Cleaning old records for ${date}...`);
    await prisma.dailyTop5.deleteMany({ where: { date } });

    console.log(`[Fix] Inserting ${correctData.length} corrected records...`);
    for (const d of correctData) {
        await prisma.dailyTop5.create({
            data: {
                date,
                code: d.code,
                name: d.name,
                score: d.score,
                currentPrice: d.price,
                yield: d.change,
                category: d.cat,
                entryPrice1: d.entry1,
                entryPrice2: d.entry2,
                stopLoss: d.sl,
                targetPrice1: d.tp,
                tradeAmount: d.trade,
                foreignBuy: 0, // Not provided in text but can be updated later
                instBuy: 0,
                createdAt: new Date()
            }
        });
    }

    console.log('[Fix] Done. Data synchronized with User Report.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
