const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- [Ghost Cleanup] Starting ---');
  try {
    const today = '2026-04-11';
    
    // 1. Delete all future records and today's inconsistent records
    console.log('Cleaning up DailyTop5 entries for today and future...');
    const deletedTop5 = await prisma.dailyTop5.deleteMany({
      where: { date: { gte: today } }
    });
    console.log(`Successfully deleted ${deletedTop5.count} DailyTop5 records.`);

    // 2. Clear Redis cache just in case
    const redis = require('../platform/infra/redis/client.cjs');
    await redis.del('mp:top:5');
    await redis.del('mp:top:10');
    console.log('Redis cache cleared.');

    console.log('--- Cleanup Complete ---');
  } catch (err) {
    console.error('Cleanup Error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
