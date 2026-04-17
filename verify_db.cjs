const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
  try {
    console.log('Available Prisma models:', Object.keys(prisma).filter(k => !k.startsWith('_')));
    
    const instrumentCount = await prisma.instrument.count();
    const candleCount = await prisma.candle.count();
    
    // Check for today's candles (2026-04-16)
    const today = new Date('2026-04-16');
    const todayCandleCount = await prisma.candle.count({
      where: {
        candleAt: {
          gte: today
        }
      }
    });

    const lastCandle = await prisma.candle.findFirst({
      orderBy: { candleAt: 'desc' },
      include: { instrument: true }
    });

    console.log('--- DB Content Check ---');
    console.log(`Total Instruments: ${instrumentCount}`);
    console.log(`Total Candles: ${candleCount}`);
    console.log(`Today's Candles (since 2026-04-16): ${todayCandleCount}`);
    
    if (lastCandle) {
        console.log(`Latest Candle at: ${lastCandle.candleAt}`);
        console.log(`Latest Candle for: ${lastCandle.instrument.symbol} (${lastCandle.instrument.name})`);
    } else {
        console.log('No candles found in DB.');
    }

  } catch (e) {
    console.error('DB Check failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
