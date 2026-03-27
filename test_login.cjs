const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@mpstock.co.kr';
  const password = 'admin123!';

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log('User not found');
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    console.log(`Email: ${email}`);
    console.log(`Match Result: ${isMatch}`);
    console.log(`Hash in DB: ${user.passwordHash}`);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
