const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
  const tag = '2026-04-11 01:45'; // Previous successful one
  const tag2 = '2026-04-11 01:56'; // The one user is reporting (likely)
  
  console.log('--- [RED TEAM AUDIT] Comparing Snapshots ---');
  try {
    const logs = await prisma.syncSaveLog.findMany({
      where: { tagName: { in: [tag, tag2] } },
      orderBy: { savedAt: 'desc' }
    });

    logs.forEach(log => {
      console.log(`\nTag: ${log.tagName} | SavedAt: ${log.savedAt.toISOString()}`);
      const snapshot = typeof log.snapshot === 'string' ? JSON.parse(log.snapshot) : log.snapshot;
      console.table(snapshot.map(s => ({ code: s.code, name: s.name, score: s.score || s.total_score })));
    });

    const dailyTop = await prisma.dailyTop5.findMany({
      where: { date: '2026-04-11' }
    });
    console.log('\nCurrent DailyTop5 Table (date=2026-04-11):');
    console.table(dailyTop.map(d => ({ code: d.code, name: d.name, score: d.score })));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

audit();
