const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'choisooki7@gmail.com';
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email },
        { username: 'woo4245' }
      ]
    }
  });
  
  if (user) {
    console.log('User found:', JSON.stringify(user, null, 2));
  } else {
    console.log('User not found');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
