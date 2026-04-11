const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const log = await prisma.syncSaveLog.findFirst({
            where: { tagName: '2026-04-09 23:58' }
        });
        
        if (log) {
            console.log('--- Verification: Tag(2026-04-09 23:58) ---');
            console.log('TagName:', log.tagName);
            console.log('Snapshot[0]:', JSON.stringify(log.snapshot[0], null, 2));
            
            const hasHybrid = log.snapshot[0].currentPrice !== undefined && log.snapshot[0].current_price !== undefined;
            console.log('Hybrid Mapping Check:', hasHybrid ? 'PASS' : 'FAIL');
            
            const price = log.snapshot[0].currentPrice || log.snapshot[0].current_price || 0;
            console.log('Price Check:', price > 0 ? 'PASS (' + price + '원)' : 'FAIL (0원)');
        } else {
            console.log('Log not found for tag: 2026-04-09 23:58');
        }
    } catch (e) {
        console.error('Check Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
