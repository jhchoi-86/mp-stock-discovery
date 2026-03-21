const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT tablename, schemaname
      FROM pg_catalog.pg_tables
      WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';
    `);
    console.log('--- ALL TABLES ---');
    console.log(result);
  } catch(e) {
    console.error('Check err:', e);
  }
}
main().finally(() => prisma.$disconnect());
