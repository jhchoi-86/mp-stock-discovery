const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const total = await prisma.pppWatchlist.count();
    console.log(`TOTAL_COUNT: ${total}`);
    
    if (total > 0) {
      const sample = await prisma.pppWatchlist.findFirst();
      console.log('SAMPLE_DATA:', JSON.stringify(sample, null, 2));
    }
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
check();
