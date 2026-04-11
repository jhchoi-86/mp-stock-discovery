const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('--- [DEBUG] Checking SyncSaveLog Audit Trail ---');
  try {
    const logs = await prisma.syncSaveLog.findMany({
      orderBy: { savedAt: 'desc' },
      take: 5
    });

    if (logs.length === 0) {
      console.log('No SyncSaveLogs found.');
      return;
    }

    logs.forEach((log, index) => {
      console.log(`\n[Log #${index}] Tag: ${log.tagName} | SavedAt: ${log.savedAt.toISOString()}`);
      const snapshot = typeof log.snapshot === 'string' ? JSON.parse(log.snapshot) : log.snapshot;
      
      const tableData = snapshot.map(s => ({
        code: s.code,
        name: s.name,
        score: s.score || s.total_score || 0,
        price: s.currentPrice || s.current_price
      }));
      console.table(tableData);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
