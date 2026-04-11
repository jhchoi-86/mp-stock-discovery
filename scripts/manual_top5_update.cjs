
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const manualStocks = [
  {
    code: '093370',
    name: '후성',
    category: '추세 지속형',
    score: 97,
    starGrade: '5',
    currentPrice: 8890,
    entryPrice1: 8890,  // Adjusted: Original 9440 > Current 8890
    entryPrice2: 6920,
    targetPrice1: 9156, // Adjusted: Original 8797 < Current 8890 (Applied 3% upside)
    targetPrice2: 9237,
    stopLoss: 6782,
    trendType: '상승',
    trendStrength: '29',
    changeRate: 10.99,
    tradeAmount: BigInt(98816348200),
    foreignBuy: '-996050',
    instBuy: '334774'
  },
  {
    code: '097950',
    name: 'CJ제일제당',
    category: '박스권 횡보',
    score: 94,
    starGrade: '5',
    currentPrice: 226000,
    entryPrice1: 224500,
    entryPrice2: 211000,
    targetPrice1: 231486,
    targetPrice2: 243060,
    stopLoss: 206780,
    trendType: '상승',
    trendStrength: '18',
    changeRate: 3.10,
    tradeAmount: BigInt(29850686000),
    foreignBuy: '10235',
    instBuy: '63802'
  },
  {
    code: '028050',
    name: '삼성E&A',
    category: '추세 지속형',
    score: 93,
    starGrade: '5',
    currentPrice: 40050,
    entryPrice1: 40050, // Adjusted: Original 42550 > Current
    entryPrice2: 35000,
    targetPrice1: 41332,
    targetPrice2: 43399,
    stopLoss: 34300,
    trendType: '상승',
    trendStrength: '39',
    changeRate: 12.58,
    tradeAmount: BigInt(491792245325),
    foreignBuy: '-1608328',
    instBuy: '777999'
  },
  {
    code: '096770',
    name: 'SK이노베이션',
    category: '박스권 횡보',
    score: 91,
    starGrade: '5',
    currentPrice: 117000,
    entryPrice1: 117000, // Adjusted: Original 117800 > Current
    entryPrice2: 112700,
    targetPrice1: 122899,
    targetPrice2: 129044,
    stopLoss: 110446,
    trendType: '관망',
    trendStrength: '15',
    changeRate: 4.23,
    tradeAmount: BigInt(75060378000),
    foreignBuy: '75380',
    instBuy: '157224'
  },
  {
    code: '066970',
    name: '엘앤에프',
    category: '추세 지속형',
    score: 87,
    starGrade: '4',
    currentPrice: 165200,
    entryPrice1: 165200, // Adjusted: Original 168600 > Current
    entryPrice2: 145200,
    targetPrice1: 174525,
    targetPrice2: 183251,
    stopLoss: 142296,
    trendType: '상승',
    trendStrength: '28',
    changeRate: 2.52,
    tradeAmount: BigInt(157148258650),
    foreignBuy: '-116188',
    instBuy: '126162'
  }
];

async function updateManual() {
  try {
    console.log('--- MANUAL TOP 5 UPDATE START (v7.8.22 Sane Logic) ---');
    const now = new Date();

    for (const s of manualStocks) {
      await prisma.dailyStockSnapshot.upsert({
        where: { id: `manual_${s.code}_${now.toISOString().split('T')[0]}` }, // Simplified ID
        update: { ...s, createdAt: now },
        create: { 
            id: `manual_${s.code}_${now.toISOString().split('T')[0]}`,
            ...s, 
            createdAt: now, 
            isExecuted: false 
        }
      }).catch(async (err) => {
          // If ID logic fails, just create
          await prisma.dailyStockSnapshot.create({
            data: { ...s, createdAt: now, isExecuted: false }
          });
      });
      console.log(`Updated: ${s.name} (${s.code}) with score ${s.score}`);
    }

    // Clear Redis Cache
    try {
        const rClient = require('./platform/infra/redis/client.cjs');
        await rClient.del('mp:top:5');
        console.log('Redis Key [mp:top:5] cleared.');
    } catch (re) {
        console.warn('Redis clear failed:', re.message);
    }

    console.log('--- MANUAL TOP 5 UPDATE COMPLETE ---');
  } catch (e) {
    console.error('Update failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

updateManual();
