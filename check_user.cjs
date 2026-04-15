const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@gmail.com' }
  });
  console.log('User status:', JSON.stringify(user, null, 2));
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
