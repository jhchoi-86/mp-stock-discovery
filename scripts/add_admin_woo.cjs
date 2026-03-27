const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'choisooki7@gmail.com';
  const user = await prisma.user.findFirst({
    where: { 
      OR: [
        { email: email },
        { name: 'woo4245' }
      ]
    }
  });

  if (!user) {
    console.log('User not found: choisooki7@gmail.com / woo4245');
    return;
  }

  console.log(`Updating role for user: ${user.username} (${user.email}, current role: ${user.role})`);
  
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' }
  });

  console.log(`Success! ${updatedUser.username} is now an ADMIN.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
