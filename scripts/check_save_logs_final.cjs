const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('--- [FINAL VERIFY] Checking SyncSaveLog Audit Trail ---');
  try {
    const logs = await prisma.syncSaveLog.findMany({
      orderBy: { savedAt: 'desc' },
      take: 5
    });

    console.log(`Retrieved ${logs.length} latest logs.`);
    logs.forEach((log, index) => {
      const savedKST = new Date(log.savedAt.getTime() + 9 * 60 * 60 * 1000).toLocaleString('ko-KR');
      console.log(`\n[Log #${index}] Tag: ${log.tagName} | SavedAt(KST): ${savedKST}`);
      const snapshot = typeof log.snapshot === 'string' ? JSON.parse(log.snapshot) : log.snapshot;
      
      const tableData = (snapshot || []).slice(0, 5).map(s => ({
        code: s.code,
        name: s.name,
        score: s.score || s.total_score || 0
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
