const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log(`Checking for date >= ${today.toISOString()}`);
    
    const count = await prisma.dailyStockSnapshot.count({
      where: {
        createdAt: {
          gte: today
        }
      }
    });
    
    console.log(`Total snapshots found for today: ${count}`);
    
    if (count > 0) {
      const sample = await prisma.dailyStockSnapshot.findFirst({
        where: {
          createdAt: {
            gte: today
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      console.log('Sample Stock Data (First one):');
      console.log(JSON.stringify(sample, null, 2));
      
      const top5 = await prisma.dailyTop5.findMany({
        where: {
          createdAt: {
            gte: today
          }
        },
        orderBy: {
          score: 'desc'
        }
      });
      
      console.log('\nTop 5 Stocks in DB:');
      top5.forEach((s, i) => {
        console.log(`${i+1}. ${s.name} (${s.code}) - Score: ${s.score}, Price: ${s.currentPrice}`);
      });
    }
  } catch (e) {
    console.error('Error connecting to DB:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
