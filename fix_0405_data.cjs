const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OFFICIAL_TOP5 = [
    { code: "028050", entry1: 37139, entry2: 31050, target: 42578, sl: 36024 },
    { code: "375500", entry1: 65600, entry2: 65600, target: 74658, sl: 63632 },
    { code: "120110", entry1: 78100, entry2: 73500, target: 84774, sl: 72030 },
    { code: "003030", entry1: 220381, entry2: 188300, target: 265650, sl: 213769 },
    { code: "218410", entry1: 89733, entry2: 74600, target: 94219, sl: 87041 }
];

async function main() {
    console.log('🚀 Starting 04/05 Data Correction...');
    
    for (const stock of OFFICIAL_TOP5) {
        const result = await prisma.dailyStockSnapshot.updateMany({
            where: {
                code: stock.code,
                createdAt: {
                    gte: new Date('2026-04-05T00:00:00Z'),
                    lt: new Date('2026-04-06T00:00:00Z')
                }
            },
            data: {
                entryPrice1: stock.entry1,
                entryPrice2: stock.entry2,
                targetPrice1: stock.target,
                stopLoss: stock.sl
            }
        });
        console.log(`✅ Updated ${stock.code}: ${result.count} records`);
    }
    
    console.log('🏁 Data correction completed.');
}

main()
    .catch(e => {
        console.error('❌ Error during data correction:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
