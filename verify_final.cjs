const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  const codes = ['093370', '096770', '097950'];
  console.log('--- FINAL DATABASE AUDIT REPORT ---');
  for (const code of codes) {
    const r = await prisma.dailyStockSnapshot.findFirst({
      where: { code },
      orderBy: { createdAt: 'desc' }
    });
    if (r) {
      console.log(`Stock: ${r.name} (${r.code})`);
      console.log(`  Current Price: ${r.currentPrice.toLocaleString()}원`);
      console.log(`  Entry 1: ${r.entryPrice1.toLocaleString()}원`);
      console.log(`  Target 1: ${r.targetPrice1.toLocaleString()}원`);
      console.log(`  Score: ${Math.round(r.score)}점`);
      
      // Verification logic
      const eGuard = r.entryPrice1 <= r.currentPrice * 0.98;
      const tGuard = r.targetPrice1 >= r.currentPrice * 1.10;
      console.log(`  Entry Guard Check: ${eGuard ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  Target Guard Check: ${tGuard || r.targetPrice1 > r.currentPrice ? 'PASS ✅' : 'FAIL ❌ (Target < Current)'}`);
    } else {
      console.log(`Stock code ${code} NOT FOUND`);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}
verify();
