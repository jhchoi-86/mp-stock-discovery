'use strict';

// ──────────────────────────────────────────────────────────────────
// scripts/kis_lag_test.cjs — KIS/Yahoo API 응답 지연 실측 (실측 전용)
// 사용법: node scripts/kis_lag_test.cjs
// 결과:   logs/kis_lag_YYYYMMDD.csv
// ──────────────────────────────────────────────────────────────────

require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const dayjs = require('dayjs');

const { fetchHybridHistory } = require('../analyzer.cjs');
const { getToken }           = require('../lib/token_manager.cjs');

const TEST_TICKERS = [
  { code: '005930', name: '삼성전자',  market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { code: '035420', name: 'NAVER',     market: 'KOSPI' },
  { code: '005380', name: '현대차',    market: 'KOSPI' },
  { code: '051910', name: 'LG화학',    market: 'KOSPI' },
  // 코스닥 5종목 — 데니얼이 아래에 추가
  // { code: '000000', name: '종목명', market: 'KOSDAQ' },
];

const INTERVAL_MS   = 60 * 1000;
const MEASURE_TIMES = 30;
const LOG_DIR       = path.join(__dirname, '../logs');

async function runLagTest() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  const today   = dayjs().format('YYYYMMDD');
  const logFile = path.join(LOG_DIR, `kis_lag_${today}.csv`);

  const header = 'timestamp,ticker,tf,elapsed_ms,success,error\n';
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, header);

  console.log(`[LagTest] 실측 시작 — ${today}`);
  console.log(`[LagTest] 측정 종목: ${TEST_TICKERS.map(t => t.code).join(', ')}`);
  console.log(`[LagTest] 결과 파일: ${logFile}`);

  const kisToken = await getToken().catch(() => null);
  let count = 0;

  async function measure() {
    if (count >= MEASURE_TIMES) {
      console.log(`[LagTest] 측정 완료 — ${logFile}`);
      summarize(logFile);
      return;
    }
    count++;
    const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
    console.log(`\n[LagTest] 측정 ${count}/${MEASURE_TIMES} (${ts})`);

    for (const ticker of TEST_TICKERS) {
      for (const tf of ['1D', '1H']) {
        const interval = tf === '1D' ? '1d' : '1h';
        const days     = tf === '1D' ? 5 : 2;
        const start    = Date.now();
        let success = true;
        let errMsg  = '';

        try {
          await Promise.race([
            fetchHybridHistory(ticker, days, interval, kisToken, null),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
          ]);
        } catch (err) {
          success = false;
          errMsg  = err.message;
        }

        const elapsed = Date.now() - start;
        const row = `${ts},${ticker.code},${tf},${elapsed},${success},"${errMsg}"\n`;
        fs.appendFileSync(logFile, row);
        console.log(`  ${ticker.code} ${tf}: ${elapsed}ms ${success ? '✓' : `✗ (${errMsg})`}`);
      }
    }

    setTimeout(measure, INTERVAL_MS);
  }

  await measure();
}

function summarize(logFile) {
  const lines   = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(1);
  const elapsed = lines
    .filter(l => l.includes(',true,'))
    .map(l => parseInt(l.split(',')[3]))
    .filter(n => !isNaN(n));

  if (elapsed.length === 0) {
    console.log('[LagTest] 성공 케이스 없음 — 네트워크 확인 필요');
    return;
  }

  const avg   = (elapsed.reduce((a, b) => a + b, 0) / elapsed.length / 1000).toFixed(2);
  const worst = (Math.max(...elapsed) / 1000).toFixed(2);
  const p95   = (elapsed.sort((a, b) => a - b)[Math.floor(elapsed.length * 0.95)] / 1000).toFixed(2);

  console.log('\n========================================');
  console.log('[LagTest] 실측 요약');
  console.log(`  평균 응답:    ${avg}초`);
  console.log(`  P95:          ${p95}초`);
  console.log(`  최악 응답:    ${worst}초`);
  const recommendedMin = Math.ceil((parseFloat(worst) + 180) / 60) + (18 * 60);
  const h = Math.floor(recommendedMin / 60);
  const m = recommendedMin % 60;
  console.log(`  → sync_scheduler.cjs Phase 1 cron 권장값: '${m} ${h} * * 1-5'`);
  console.log('========================================\n');
}

runLagTest().catch(err => {
  console.error('[LagTest] 실행 오류:', err.message);
  process.exit(1);
});
