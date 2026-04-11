// dump_top5_v2.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
BigInt.prototype.toJSON = function() { return this.toString() };

async function run() {
    try {
        // [v4213] 점수(score) 내림차순 기준 정렬로 교정
        const top5 = await prisma.dailyStockSnapshot.findMany({
            where: {
                createdAt: {
                    gte: new Date(new Date().setHours(0,0,0,0)) // 오늘 생성된 데이터만
                }
            },
            orderBy: [
                { score: 'desc' },
                { tradeAmount: 'desc' }
            ],
            take: 10 // 상위 10개 추출 후 검토
        });
        
        console.log('--- CORRECT DATA START ---');
        console.log(JSON.stringify(top5, null, 2));
        console.log('--- CORRECT DATA END ---');
    } catch (e) {
        console.error('Extraction Failed:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
run();
