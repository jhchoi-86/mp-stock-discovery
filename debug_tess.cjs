const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    const code = process.argv[2] || '095610';
    console.log(`Checking Latest Snapshot for ${code}`);
    
    const snap = await p.dailyStockSnapshot.findFirst({
        where: { code: code },
        orderBy: { createdAt: 'desc' }
    });
    
    console.log(JSON.stringify(snap, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

    const sync = await p.syncSaveLog.findFirst({
        orderBy: { savedAt: 'desc' }
    });
    console.log('\nLatest Sync Log Snapshot (Sample):');
    if (sync && Array.isArray(sync.snapshot)) {
        console.log(JSON.stringify(sync.snapshot.find(s => s.code === code), null, 2));
    }
}

main().catch(e => console.error('Error:', e.message)).finally(() => p.$disconnect());
