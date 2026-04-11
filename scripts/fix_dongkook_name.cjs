const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

  let url = process.env.DATABASE_URL;
  if (url && url.includes('127.0.0.1')) {
      url = url.replace('127.0.0.1', 'localhost');
  }
  const prisma = new PrismaClient({
    datasources: { db: { url } }
  });

async function main() {
  console.log('--- Cleaning Up "TEST_동국제약" in Database ---');

  try {
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
      
      // Handle potential stringified JSON (prisma sometimes returns Json as string depending on config)
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

    console.log('\nCleanup completed successfullly.');
  } catch (err) {
    console.error('Error during cleanup:', err.message);
    if (err.message.includes('Can\'t reach database server')) {
        console.log('\n[NOTICE] DB server is not reachable from this terminal context.');
        console.log('Please run this script manually in an environment where the database is accessible:');
        console.log('node scripts/fix_dongkook_name.cjs');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
