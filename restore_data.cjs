const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE system_audit."User" AS new_u
      SET name = old_u.name,
          phone = old_u.phone
      FROM public.users AS old_u
      WHERE new_u.email = old_u.email;
    `);
    
    console.log(`기존 유저 정보 (${result}명) 이름 및 전화번호 복구 완료!`);
  } catch (err) {
    console.error('데이터 복구 실패:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
