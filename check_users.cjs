const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany();
    console.log('Current Users in DB:');
    users.forEach(u => console.log(`ID: ${u.id}, Email: ${u.email}, Role: ${u.role}`));
    
    // Also, if you need to reset the PM password, we can do it here:
    // We'll just list them for now.
  } catch (e) {
    console.error('DB Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
