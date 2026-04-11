const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function generateUniqueReferralCode(tx) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await tx.user.findFirst({ where: { referralCode: code } });
    if (!existing) isUnique = true;
  }
  return code;
}

async function main() {
  console.log('[Referral Initialization] Starting to populate referral codes for existing users...');
  
  const usersWithoutCode = await prisma.user.findMany({
    where: {
      OR: [
        { referralCode: null },
        { referralCode: '' }
      ]
    }
  });

  console.log(`[Referral Initialization] Found ${usersWithoutCode.length} users without a referral code.`);

  for (const user of usersWithoutCode) {
    try {
      const code = await generateUniqueReferralCode(prisma);
      await prisma.user.update({
        where: { id: user.id },
        data: { referralCode: code, referralCount: 0 }
      });
      console.log(`[Referral Initialization] Updated user ${user.email} with code: ${code}`);
    } catch (err) {
      console.error(`[Referral Initialization] Failed to update user ${user.email}:`, err.message);
    }
  }

  console.log('[Referral Initialization] Finished.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
