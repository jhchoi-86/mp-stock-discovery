const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const data = await prisma.dailyTop5.findMany({
      where: {
        date: { in: ['2026-04-06', '2026-04-07'] }
      },
      orderBy: { date: 'asc' }
    });
    
    // Custom replacer for BigInt
    const replacer = (key, value) => 
      typeof value === 'bigint' ? value.toString() : value;
      
    console.log(JSON.stringify(data, replacer, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
