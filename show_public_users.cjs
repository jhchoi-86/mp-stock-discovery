const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.$queryRawUnsafe(`SELECT email, role, name, phone FROM public.users`);
    console.log("Current public.users in DB:", users);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
