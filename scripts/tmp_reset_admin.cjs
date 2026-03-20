const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function resetAdmin() {
  try {
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      console.log('No admin user found.');
      return;
    }
    console.log(`Found admin: ${adminUser.email} (Name: ${adminUser.name})`);
    const newPassword = 'adminPassword123!';
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { passwordHash }
    });
    console.log(`Password reset successful for ${adminUser.email}. New password: ${newPassword}`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdmin();
