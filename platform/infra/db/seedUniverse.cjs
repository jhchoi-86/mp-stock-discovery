const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

async function seedKrEquity() {
  console.log('Seeding KR Equity (KOSPI 200, KOSDAQ 150)...');
  // Mocking insertion for now until KIS API connection is finalized
  const dummyKr = [
    { symbol: '005930', name: '삼성전자', market: 'kr_kospi', currency: 'KRW' },
    { symbol: '373220', name: 'LG에너지솔루션', market: 'kr_kospi', currency: 'KRW' },
    { symbol: '247540', name: '에코프로비엠', market: 'kr_kosdaq', currency: 'KRW' }
  ];
  try {
    const creates = dummyKr.map(d => prisma.instrument.create({ data: d }));
    await Promise.all(creates);
  } catch (e) {
    console.error('KREquity seed error/skip:', e.message);
  }
}

async function seedUsEquity() {
  console.log('Seeding US Equity (NASDAQ 100)...');
  const dummyUs = [
    { symbol: 'AAPL', name: 'Apple Inc.', market: 'us_nasdaq', currency: 'USD' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', market: 'us_nasdaq', currency: 'USD' }
  ];
  try {
    const creates = dummyUs.map(d => prisma.instrument.create({ data: d }));
    await Promise.all(creates);
  } catch (e) {
    console.error('USEquity seed error/skip:', e.message);
  }
}

async function seedCrypto() {
  console.log('Seeding Crypto Spot (Top 100)...');
  const dummyCrypto = [
    { symbol: 'BTCUSDT', name: 'Bitcoin', market: 'crypto_spot', currency: 'USDT' },
    { symbol: 'ETHUSDT', name: 'Ethereum', market: 'crypto_spot', currency: 'USDT' }
  ];
  try {
    const creates = dummyCrypto.map(d => prisma.instrument.create({ data: d }));
    await Promise.all(creates);
  } catch (e) {
    console.error('Crypto seed error/skip:', e.message);
  }
}

async function main() {
  await seedKrEquity();
  await seedUsEquity();
  await seedCrypto();
  console.log('Universe seeding complete.');
}

if (require.main === module) {
  main().catch(console.error).finally(() => prisma.$disconnect());
}
