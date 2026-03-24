const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    // get a valid admin
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.log('No admin found');
      return;
    }
    console.log('Using admin:', admin.id);

    // 1. Save Report
    console.log('Attempting report.create...');
    await prisma.report.create({
      data: {
        content: 'Test content',
        authorId: admin.id
      }
    });
    console.log('report.create success!');

    // 2. Log Action
    console.log('Attempting auditLog.create...');
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'MANUAL_TELEGRAM_BROADCAST',
        details: { textLength: 12, recCount: 0 }
      }
    });
    console.log('auditLog.create success!');

    // 3. Find users
    console.log('Attempting findMany...');
    const targetUsers = await prisma.user.findMany({
      where: {
        role: { in: ['USER', 'FREE', 'FREE_USER', 'PRO_USER', 'PAID', 'ADMIN'] },
        telegramId: { not: null, not: '' }
      },
      select: { id: true, email: true, telegramId: true }
    });
    console.log('findMany success, found:', targetUsers.length);
    
    // 4. Log broadcast success
    console.log('Attempting auditLog.create broadcast success...');
    await prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'BROADCAST_REPORT_SUCCESS',
          details: { sentCount: 1, totalTargeted: targetUsers.length }
        }
      });
    console.log('broadcast success log success!');

  } catch (e) {
    console.error('THROWN ERROR:', e);
  } finally {
    await prisma.$disconnect();
  }
}

test();
