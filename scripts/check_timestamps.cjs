const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('--- [DEBUG] Checking DailyTop5 Update Timestamps ---');
  try {
    const data = await prisma.dailyTop5.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10
    });

    const result = data.map(d => ({
      code: d.code,
      name: d.name,
      score: d.score,
      updated: d.updatedAt.toISOString(),
      updated_kr: new Date(d.updatedAt.getTime() + 9 * 60 * 60 * 1000).toLocaleString('ko-KR')
    }));

    console.table(result);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
