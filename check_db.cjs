const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRawUnsafe(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public', 'system_audit')`);
    console.log(tables);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
