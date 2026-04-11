// dump_samples.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
BigInt.prototype.toJSON = function() { return this.toString() };

async function run() {
    try {
        const data = await prisma.dailyStockSnapshot.findMany({
            orderBy: { id: 'desc' },
            take: 5
        });
        console.log('--- SAMPLE DATA START ---');
        console.log(JSON.stringify(data, null, 2));
        console.log('--- SAMPLE DATA END ---');
    } catch (e) {
        console.error('Data Dump Failed:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
run();
