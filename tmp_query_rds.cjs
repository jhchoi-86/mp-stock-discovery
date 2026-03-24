const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const reports = await prisma.report.findMany({
            orderBy: { sentAt: 'desc' },
            take: 20
        });
        console.log("=== RECENT REPORTS SUMMARY ===");
        reports.forEach(r => {
            const dateStr = new Date(r.sentAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
            
            // Extract lines starting with 🔹
            const lines = r.content.split('\n');
            const stocks = lines.filter(l => l.trim().startsWith('🔹')).map(l => l.trim().substring(2).split('(')[0].trim());
            // Unique stocks
            const uniqueStocks = [...new Set(stocks)];
            
            console.log(`\n[${dateStr}] (ID: ${r.id})`);
            console.log(`Stocks: ${uniqueStocks.join(', ')}`);
        });
    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
