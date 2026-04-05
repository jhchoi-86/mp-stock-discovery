require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatestRecord() {
  try {
    const latest = await prisma.dailyStockSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, id: true }
    });
    
    if (latest) {
      console.log(`LATEST_RECORD_TIME: ${latest.createdAt.toISOString()}`);
      console.log(`LATEST_ID: ${latest.id}`);
      
      const count = await prisma.dailyStockSnapshot.count();
      console.log(`TOTAL_COUNT: ${count}`);
    } else {
      console.log("NO_RECORDS_FOUND");
    }
  } catch (e) {
    console.error("DB_QUERY_ERROR:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkLatestRecord();
