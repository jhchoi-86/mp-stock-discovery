const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const publicUsers = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM public.users`);
    const auditUsers = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM system_audit."User"`);
    console.log("public.users count:", publicUsers);
    console.log("system_audit.User count:", auditUsers);

    const sample = await prisma.$queryRawUnsafe(`SELECT * FROM system_audit."User" LIMIT 5`);
    console.log("Sample backup data:", sample);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
