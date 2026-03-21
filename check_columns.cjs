const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users';
    `);
    console.log('--- COLUMNS IN public.users ---');
    console.log(result);
  } catch(e) {
    console.error('Check err:', e);
  }
}
main().finally(() => prisma.$disconnect());
