const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const results = await prisma.dailyTop5.findMany({
        orderBy: { date: 'desc' },
        take: 20
    });
    
    // Custom JSON stringify to handle BigInt
    const output = JSON.stringify(results, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    , 2);
    
    console.log(output);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
