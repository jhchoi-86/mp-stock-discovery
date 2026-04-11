const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const today = '2026-04-11';
  console.log(`--- [DEBUG] Checking Data for ${today} ---`);
  try {
    const dailyTop5 = await prisma.dailyTop5.findMany({ where: { date: today } });
    console.log(`DailyTop5 entries: ${dailyTop5.length}`);
    
    if (dailyTop5.length > 0) {
      console.table(dailyTop5.map(d => ({ code: d.code, name: d.name, score: d.score })));
    }

    const logs = await prisma.syncSaveLog.findMany({
      where: {
        savedAt: {
          gte: new Date(`${today}T00:00:00Z`)
        }
      }
    });
    console.log(`SyncSaveLog entries: ${logs.length}`);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
