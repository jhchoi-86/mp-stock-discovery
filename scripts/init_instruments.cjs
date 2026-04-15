'use strict';

// ──────────────────────────────────────────────────────────────────
// scripts/init_instruments.cjs — Instrument 테이블 초기화
// stock_master.json을 기반으로 DB에 종목 마스터 데이터 적재
// ──────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const STOCK_MASTER_FILE = path.join(__dirname, '../data', 'stock_master.json');

async function main() {
  if (!fs.existsSync(STOCK_MASTER_FILE)) {
    console.error('stock_master.json 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));
  console.log(`총 ${stocks.length}개의 종목을 처리합니다...`);

  let count = 0;
  for (const stock of stocks) {
    await prisma.instrument.upsert({
      where: { symbol: stock.code },
      update: {
        name:   stock.name,
        market: stock.market || 'KOSPI',
        isActive: true
      },
      create: {
        symbol: stock.code,
        name:   stock.name,
        market: stock.market || 'KOSPI',
        isActive: true
      }
    });
    count++;
    if (count % 100 === 0) console.log(`${count}개 완료...`);
  }

  console.log(`Instrument 테이블 초기화 완료: 총 ${count}건`);
  process.exit(0);
}

main().catch(err => {
  console.error('오류 발생:', err);
  process.exit(1);
});
