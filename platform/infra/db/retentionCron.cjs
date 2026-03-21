// cron: '0 3 * * *' (매일 03:00)
// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

async function cleanupOldData() {
  console.log('[RetentionCron] Running data cleanup at 03:00...');
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  /*
  await prisma.candle.deleteMany({
    where: { candleAt: { lt: ninetyDaysAgo } }
  });
  
  await prisma.signalCandidate.deleteMany({
    where: {
      createdAt: { lt: ninetyDaysAgo },
      approvedSignal: { is: null }
    }
  });
  */
  console.log('[RetentionCron] Cleanup completed.');
}

module.exports = { cleanupOldData };
