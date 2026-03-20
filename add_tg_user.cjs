const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Searching for woo4245...');
    let user = await prisma.user.findFirst({
        where: { OR: [{ name: 'woo4245' }, { email: { contains: 'woo4245' } }] }
    });

    if (user) {
        const u = await prisma.user.update({
            where: { id: user.id },
            data: { telegramId: '8577292579', role: 'PRO_USER', status: 'ACTIVE' }
        });
        console.log('Updated existing user:', u.email, 'with PRO_USER and Telegram ID : 8577292579');
    } else {
        console.log('User not found. Creating a raw member for Telegram Broadcasts...');
        // We create a dummy user. Since password encryption is not needed for telegram broadcast
        const u = await prisma.user.create({
            data: {
                email: 'woo4245@telegram.com',
                name: 'woo4245',
                password: 'telegram_only_account',
                role: 'PRO_USER',
                telegramId: '8577292579',
                status: 'ACTIVE'
            }
        });
        console.log('Created direct Telegram-Only PRO_USER account for woo4245.');
    }
  } catch (err) {
      console.error(err);
  } finally {
      await prisma.$disconnect();
  }
})();
