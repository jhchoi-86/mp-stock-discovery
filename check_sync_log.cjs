const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    const tagName = process.argv[2] || '2026-04-12 13:08';
    console.log(`Searching for tag: ${tagName}`);
    
    const latest = await p.syncSaveLog.findFirst({
        where: { tagName: { contains: tagName } },
        orderBy: { savedAt: 'desc' }
    });
    
    if (latest) {
        console.log('ID:', latest.id);
        console.log('TagName:', latest.tagName);
        console.log('SavedAt:', latest.savedAt);
        console.log('Snapshot:', JSON.stringify(latest.snapshot, null, 2));
    } else {
        console.log('No sync log found for tag:', tagName);
    }
}

main().catch(e => console.error('Error:', e.message)).finally(() => p.$disconnect());
