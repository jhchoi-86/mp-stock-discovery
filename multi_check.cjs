const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMultiple() {
    const codes = ['006360', '005380', '035720', '005930', '373220'];
    const names = ['GS건설', '현대차', '카카오', '삼성전자', 'LG에너지솔루션'];
    
    console.log('--- Multi-Stock Price Audit ---');
    try {
        for (let i = 0; i < codes.length; i++) {
            const res = await prisma.signalReport.findFirst({
                where: { code: codes[i] }
            });
            console.log(`${names[i]} (${codes[i]}): ${res ? res.currentPrice : 'N/A'}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkMultiple();
