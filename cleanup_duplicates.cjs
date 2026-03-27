const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Database Duplicate Cleanup Started ---');
    
    // 1. Get all snapshots grouped by date and code to find duplicates
    const snapshots = await prisma.dailyStockSnapshot.findMany({
        orderBy: { createdAt: 'desc' }
    });

    const groups = {}; // key: "YYYY-MM-DD:CODE"
    
    snapshots.forEach(s => {
        const dateStr = s.createdAt.toISOString().split('T')[0];
        const key = `${dateStr}:${s.code}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(s);
    });

    let deletedCount = 0;
    for (const key in groups) {
        const group = groups[key];
        if (group.length > 1) {
            // Sort by score desc, keeping the best one
            group.sort((a, b) => (b.score || 0) - (a.score || 0));
            const keepId = group[0].id;
            const deleteIds = group.slice(1).map(x => x.id);
            
            console.log(`Cleaning group ${key}: Keeping ID ${keepId}, deleting ${deleteIds.length} duplicates.`);
            
            await prisma.dailyStockSnapshot.deleteMany({
                where: { id: { in: deleteIds } }
            });
            deletedCount += deleteIds.length;
        }
    }

    console.log(`--- Cleanup Finished! Total deleted: ${deletedCount} ---`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
