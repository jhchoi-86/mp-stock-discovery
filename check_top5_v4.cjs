const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
  try {
    const today = "2026-04-07";
    const data = await prisma.dailyTop5.findMany({
      where: { date: today }
    });
    console.log("=== DAILY TOP 5 (2026-04-07) ===");
    console.log(JSON.stringify(data, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 
    2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
