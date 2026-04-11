const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  console.log('--- Database Connection Check ---');
  try {
    await prisma.$connect();
    console.log('Connected successfully.');
  } catch (e) {
    console.error('Connection failed:', e.message);
    return;
  }

  console.log('\n--- Latest DailyTop5 ---');
  const latestEntry = await prisma.dailyTop5.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log('Latest Entry Date:', latestEntry?.date);
  console.log('Latest Entry CreatedAt:', latestEntry?.createdAt);

  if (latestEntry) {
    const top5 = await prisma.dailyTop5.findMany({
      where: { date: latestEntry.date },
      orderBy: { score: 'desc' }
    });
    console.log(`Top 5 for ${latestEntry.date}:`, top5.map(s => `${s.name} (${s.code}) - Score: ${s.score}`));
  }

  console.log('\n--- Latest SyncSaveLog ---');
  const latestLog = await prisma.syncSaveLog.findFirst({
    orderBy: { savedAt: 'desc' }
  });
  console.log('Latest Log Tag:', latestLog?.tagName);
  console.log('Latest Log SavedAt:', latestLog?.savedAt);
}

main().catch(console.error).finally(() => prisma.$disconnect());
