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
    process.exit(1);
  }

  console.log('\n--- Cleaning Up "TEST_동국제약" ---');

  // 1. Update DailyTop5
  const top5Update = await prisma.dailyTop5.updateMany({
    where: { 
      OR: [
        { name: 'TEST_동국제약' },
        { code: '086450', name: 'TEST_동국제약' }
      ]
    },
    data: { name: '동국제약' }
  });
  console.log(`Updated DailyTop5: ${top5Update.count} records`);

  // 2. Update DailyStockSnapshot
  const snapshotUpdate = await prisma.dailyStockSnapshot.updateMany({
    where: {
      OR: [
        { name: 'TEST_동국제약' },
        { code: '086450', name: 'TEST_동국제약' }
      ]
    },
    data: { name: '동국제약' }
  });
  console.log(`Updated DailyStockSnapshot: ${snapshotUpdate.count} records`);

  // 3. Update SyncSaveLog (JSON snapshot)
  const logs = await prisma.syncSaveLog.findMany();
  let logUpdateCount = 0;
  for (const log of logs) {
    let changed = false;
    let snapshot = log.snapshot;
    
    // Handle potential stringified JSON or object
    if (typeof snapshot === 'string') {
        try { snapshot = JSON.parse(snapshot); } catch(e) {}
    }

    if (Array.isArray(snapshot)) {
      snapshot.forEach(s => {
        if (s.name === 'TEST_동국제약') {
            s.name = '동국제약';
            changed = true;
        }
      });
    }

    if (changed) {
      await prisma.syncSaveLog.update({
        where: { id: log.id },
        data: { snapshot: snapshot }
      });
      logUpdateCount++;
    }
  }
  console.log(`Updated SyncSaveLog: ${logUpdateCount} records`);

  console.log('\nCleanup completed.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
