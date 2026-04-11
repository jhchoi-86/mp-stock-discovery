const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetToday() {
  const today = '2026-04-11';
  console.log(`--- [CLEANUP] Resetting Data for ${today} ---`);
  try {
    const deleted = await prisma.dailyTop5.deleteMany({
      where: { date: today }
    });
    console.log(`Successfully deleted ${deleted.count} entries from DailyTop5.`);

    const logsDeleted = await prisma.syncSaveLog.deleteMany({
      where: {
        savedAt: {
          gte: new Date(`${today}T00:00:00Z`)
        }
      }
    });
    console.log(`Successfully deleted ${logsDeleted.count} entries from SyncSaveLog.`);

  } catch (err) {
    console.error('Cleanup failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetToday();
