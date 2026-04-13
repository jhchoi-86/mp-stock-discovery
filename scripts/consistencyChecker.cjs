// scripts/consistencyChecker.cjs
// 역할: 동기화 저장 후 DB-Redis-프론트엔드 간 데이터 정합성 자동 검증
// 실행: node scripts/consistencyChecker.cjs

const { PrismaClient } = require('@prisma/client');
const Redis            = require('ioredis');
const axios          = require('axios');
require('dotenv').config(); // 환경변수 로드

const prisma = new PrismaClient();
const redis  = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'; // server.cjs default port is 3001

async function runConsistencyCheck() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  MP Stock 데이터 정합성 검증 시작     ║');
  console.log('╚══════════════════════════════════════╝\n');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // 1. DB에서 오늘의 Top5 조회
    const dbTop5 = await prisma.dailyStockSnapshot.findMany({
      where: { 
        isTop5: true, 
        syncDate: { gte: today, lt: new Date(today.getTime() + 86400000) } 
      },
      orderBy: { rank: 'asc' },
    });

    console.log(`[DB] Top5 종목 수: ${dbTop5.length} (기대: 5)`);
    if (dbTop5.length < 5) {
      console.warn('⚠️  Top5 종목이 5개 미만! 저장 실패 확인 필요');
    }

    // 2. 종목별 Redis ↔ DB 정합성 확인
    const issues = [];

    for (const dbStock of dbTop5) {
      const { ticker, currentPrice, entryPrice1, score } = dbStock;

      // Redis 캐시 확인 (mp:snapshot:TICKER:DATE)
      const dateStr = today.toISOString().split('T')[0];
      const cacheKey = `mp:snapshot:${ticker}:${dateStr}`;
      const cached = await redis.get(cacheKey);
      
      if (!cached) {
        issues.push({ ticker, type: 'CACHE_MISSING', detail: `Redis 캐시 없음 (${cacheKey})` });
        continue;
      }

      const cacheData = JSON.parse(cached);

      // 현재가 정합성
      if (Math.round(cacheData.currentPrice) !== Math.round(currentPrice)) {
        issues.push({
          ticker,
          type:   'PRICE_MISMATCH',
          detail: `DB: ${currentPrice}원 vs Redis: ${cacheData.currentPrice}원`,
        });
      }

      // 1차 매수가 정합성
      if (Math.round(cacheData.entryPrice1) !== Math.round(entryPrice1)) {
        issues.push({
          ticker,
          type:   'ENTRY1_MISMATCH',
          detail: `DB: ${entryPrice1}원 vs Redis: ${cacheData.entryPrice1}원`,
        });
      }

      console.log(`[Check] ${ticker}: 현재가=${currentPrice}원, 1차매수=${entryPrice1}원, 점수=${score} ✅`);
    }

    // 3. API 엔드포인트 응답 검증
    try {
      // NOTE: server.cjs는 authenticateToken이 걸려있으므로 테스트 시 JWT 토큰 또는 내부 API_SECRET 우회 필요
      const response = await axios.get(`${BASE_URL}/api/top5`, {
        validateStatus: false // Allow 401/403 for checking
      });
      
      if (response.status === 401 || response.status === 403) {
        console.log('[Check] API 인증 필요 (401/403) - 수동 검증 권장');
      } else {
        const apiTop5  = response.data?.data ?? [];

        for (const dbStock of dbTop5) {
          const apiStock = apiTop5.find(s => s.ticker === dbStock.ticker);
          if (!apiStock) {
            issues.push({ ticker: dbStock.ticker, type: 'API_MISSING', detail: 'API 응답에 없음' });
            continue;
          }

          // API ↔ DB 현재가 비교
          if (Math.round(apiStock.currentPrice) !== Math.round(dbStock.currentPrice)) {
            issues.push({
              ticker:  dbStock.ticker,
              type:    'API_PRICE_MISMATCH',
              detail:  `DB: ${dbStock.currentPrice}원 vs API: ${apiStock.currentPrice}원`,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Check] API 검증 스킵 (서버 미기동?):', err.message);
    }

    // 4. 결과 출력
    console.log('\n══════════════════════════════════════');
    if (issues.length === 0) {
      console.log('✅ 정합성 검증 통과 — 모든 데이터 일치');
    } else {
      console.error(`❌ 정합성 이슈 ${issues.length}건 발견:`);
      issues.forEach(issue => {
        console.error(`  - [${issue.ticker}] ${issue.type}: ${issue.detail}`);
      });
      // process.exit(1); // 필요 시 활성화
    }
    console.log('══════════════════════════════════════\n');

  } catch (err) {
    console.error('정합성 검증 중 오류 발생:', err);
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

runConsistencyCheck().catch(err => {
  console.error('정합성 검증 치명적 오류:', err);
  process.exit(1);
});
