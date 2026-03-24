const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Testing DB Connection...');
  try {
    const users = await prisma.user.findMany({ take: 1 });
    console.log('DB Connection SUCCESS.');
    console.log(users);
  } catch (e) {
    console.error('DB Connection FAILED:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
