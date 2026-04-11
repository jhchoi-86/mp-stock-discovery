// check_stock.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Handle BigInt serialization
BigInt.prototype.toJSON = function() { return this.toString() };

async function check() {
    try {
        const stock = await prisma.dailyStockSnapshot.findFirst({
            where: { code: '003030' },
            orderBy: { id: 'desc' }
        });
        console.log('--- DB RECORD START ---');
        console.log(JSON.stringify(stock, null, 2));
        console.log('--- DB RECORD END ---');
    } catch (e) {
        console.error('DB Check Failed:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
check();
