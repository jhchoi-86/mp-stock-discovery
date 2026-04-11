const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.dailyStockSnapshot.deleteMany({
    where: {
      code: {
        in: ['TEST_ERR', 'TEST_EXM']
      }
    }
  });
  console.log('Deleted test snapshots:', result);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
