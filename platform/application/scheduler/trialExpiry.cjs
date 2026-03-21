// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

async function checkTrialExpiry() {
  console.log('[TrialExpiry] Running daily cron check...');
  const now = new Date();
  const in3days = new Date(now.getTime() + 3 * 86400000);
  const in1day  = new Date(now.getTime() + 86400000);

  /*
  const expiring3 = await prisma.user.findMany({
    where: { role: 'FREE_TRIAL', trialExpiresAt: { lte: in3days, gt: in1day } }
  });
  // Send emails...

  const expiring1 = await prisma.user.findMany({
    where: { role: 'FREE_TRIAL', trialExpiresAt: { lte: in1day, gt: now } }
  });
  // Send emails...

  const expired = await prisma.user.findMany({
    where: { role: 'FREE_TRIAL', trialExpiresAt: { lte: now } }
  });
  
  for (const u of expired) {
    await prisma.user.update({ where: { id: u.id }, data: { role: 'FREE', trialExpiresAt: null } });
  }
  */
  console.log('[TrialExpiry] Cron execution complete.');
}

module.exports = { checkTrialExpiry };
