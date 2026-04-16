const { runPhase1 } = require('../sync/phase1_snapshot.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- FINAL VERIFICATION START ---');
  
  const userCount = await prisma.user.count();
  const instrumentCount = await prisma.instrument.count();
  
  console.log('User Count:', userCount);
  console.log('Instrument Count:', instrumentCount);
  
  if (userCount === 0 || instrumentCount === 0) {
    console.error('CRITICAL: Data restoration incomplete!');
    process.exit(1);
  }

  console.log('Triggering Phase 1 Sync to recover candles...');
  await runPhase1();
  
  console.log('--- FINAL VERIFICATION COMPLETE ---');
}

main().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
