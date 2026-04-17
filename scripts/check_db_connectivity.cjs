const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('Connecting to DB...');
  try {
    await prisma.$connect();
    console.log('✅ Connection Successful!');
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
    console.log('Tables:', tables.map(t => t.table_name).join(', '));
  } catch (e) {
    console.error('❌ Connection Failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
