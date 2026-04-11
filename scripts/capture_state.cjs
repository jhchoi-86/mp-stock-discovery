const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const prisma = new PrismaClient();

async function capture(label) {
  console.log(`--- [VERIFY] Capturing ${label} State ---`);
  
  try {
    const latestTopEntry = await prisma.dailyTop5.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    
    if (!latestTopEntry) {
      console.log('[VERIFY] No entries found.');
      return;
    }

    const latestDate = latestTopEntry.date;
    const top5Entries = await prisma.dailyTop5.findMany({
      where: { date: latestDate },
      orderBy: { score: 'desc' },
      take: 5
    });

    const data = top5Entries.map(e => ({
      code: e.code,
      name: e.name,
      score: e.score,
      currentPrice: e.currentPrice,
      yield: e.yield
    }));

    const filePath = path.join(__dirname, `../data/verify_${label.toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    console.log(`[VERIFY] SUCCESS: ${data.length} records saved to ${filePath}`);
    console.table(data);

  } catch (err) {
    console.error(`[VERIFY] FAILED:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

const args = process.argv.slice(2);
const label = args[0] || 'BEFORE';
capture(label);
