const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  try {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123!', 10);
    const admin = await prisma.user.create({
      data: {
        email: process.env.ADMIN_EMAIL || 'admin@mpstock.co.kr',
        passwordHash: hash,
        role: 'ADMIN', // Enum from schema.prisma
        name: process.env.ADMIN_NAME || '슈퍼관리자'
      }
    });
    console.log('Successfully seeded admin user:', admin.email);
  } catch (e) {
    if (e.code === 'P2002') {
      console.log('Admin user already exists.');
    } else {
      console.error('DB Error:', e);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
