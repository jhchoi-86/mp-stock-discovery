const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getStockData() {
  const codes = ['011200', '000100', '450080', '096770', '373220']; // HMM, 유한양행, 에코프로머티, SK이노베이션, LG에너지솔루션
  try {
    const snapshots = await Promise.all(codes.map(code => 
      prisma.dailyStockSnapshot.findFirst({
        where: { code },
        orderBy: { createdAt: 'desc' }
      })
    ));
    console.log(JSON.stringify(snapshots, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

getStockData();
