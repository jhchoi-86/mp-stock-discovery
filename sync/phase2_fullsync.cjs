'use strict';

// ──────────────────────────────────────────────────────────────────
// sync/phase2_fullsync.cjs — Phase 2: 수정주가 Full Sync
// ──────────────────────────────────────────────────────────────────

require('dotenv').config();
const crypto = require('crypto');
const dayjs  = require('dayjs');
const pLimit = require('p-limit');
const { PrismaClient } = require('@prisma/client');

const redis = require('../platform/infra/redis/client.cjs');
const { getToken } = require('../lib/token_manager.cjs');
const { sendAlert } = require('../lib/alert_manager.cjs');
const { TIMEFRAMES, ANALYZER_LOCK_TTL } = require('../lib/constants.cjs');
const { fetchHybridHistory, runBatchAnalysis } = require('../analyzer.cjs');

const prisma = new PrismaClient();
const CONCURRENCY = 20;
const TIMEOUT_MS  = 8000;
const MAX_RETRY   = 3;

async function runPhase2() {
  const startTs = Date.now();
  console.log('[Phase2] 수정주가 Full Sync 시작');

  const phase1Success = await redis.get('phase1_success');
  if (phase1Success === 'false' || phase1Success === null) {
    await sendAlert('WARN', 'phase2_no_phase1',
      'Phase 1 미완료 상태에서 Phase 2 실행 — D+0 재수집 진행');
  }

  const instruments = await prisma.instrument.findMany({ where: { isActive: true } });
  console.log(`[Phase2] 체크섬 비교 대상: ${instruments.length}종목`);

  const kisToken = await getToken().catch(() => null);
  const limit    = pLimit(CONCURRENCY);

  const modifiedSymbols = [];

  const tasks = instruments.map(inst =>
    limit(async () => {
      try {
        const modified = await checkAndUpdateDailyCandles(inst, kisToken);
        if (modified) modifiedSymbols.push(inst.symbol);
      } catch (err) {
        console.error(`[Phase2] 체크섬 비교 실패 ${inst.symbol}:`, err.message);
      }
    })
  );

  await Promise.all(tasks);

  console.log(`[Phase2] 수정주가 감지: ${modifiedSymbols.length}종목`);

  if (modifiedSymbols.length > 0) {
    const lockAcquired = await redis.set('analyzer_lock', '1', 'EX', ANALYZER_LOCK_TTL, 'NX');
    if (!lockAcquired) {
      await sendAlert('WARN', 'phase2_lock_busy', 'analyzer_lock 획득 실패 — Phase 2 analyzer 스킵');
      console.warn('[Phase2] analyzer_lock 사용 중 — 재실행 필요');
    } else {
      try {
        await runBatchAnalysis(modifiedSymbols, TIMEFRAMES, { useDBCache: true });
        console.log(`[Phase2] ${modifiedSymbols.length}종목 × 7TF 재분석 완료`);
      } finally {
        await redis.del('analyzer_lock');
      }
    }
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);

  await Promise.all([
    redis.set('phase2_complete_ts',    new Date().toISOString(), 'EX', 86400),
    redis.set('phase2_modified_count', String(modifiedSymbols.length), 'EX', 86400),
  ]);

  await sendAlert('INFO', 'phase2_complete',
    `수정주가 동기화 완료 | ${modifiedSymbols.length}종목 수정 | 소요 ${elapsed}초`);

  console.log(`[Phase2] 완료 — ${elapsed}초`);
}

async function checkAndUpdateDailyCandles(inst, kisToken) {
  const stock = { code: inst.symbol, name: inst.name, market: inst.market || 'KOSPI' };

  let apiHistory;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      apiHistory = await Promise.race([
        fetchHybridHistory(stock, 250, '1d', kisToken, null),
        new Promise((_, reject) => setTimeout(() => reject(new Error('타임아웃')), TIMEOUT_MS)),
      ]);
      break;
    } catch (err) {
      if (attempt === MAX_RETRY) throw err;
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  if (!apiHistory || !apiHistory.close || apiHistory.close.length === 0) return false;

  const dbCandles = await prisma.candle.findMany({
    where:   { instrumentId: inst.id, timeframe: '1D' },
    orderBy: { candleAt: 'asc' },
    take:    250,
  });

  const apiHash = sha256(apiHistory.close);
  const dbHash  = sha256(dbCandles.map(c => c.close));

  if (apiHash === dbHash) return false;

  const candles = apiHistory.close.map((c, i) => ({
    instrumentId: inst.id,
    timeframe:    '1D',
    open:         apiHistory.open[i]   ?? c,
    high:         apiHistory.high[i]   ?? c,
    low:          apiHistory.low[i]    ?? c,
    close:        c,
    volume:       apiHistory.volume[i] ?? 0,
    source:       'KRX_ADJ',
    isValid:      true,
    fetchedAt:    new Date(),
    candleAt:     new Date(apiHistory.time[i] * 1000),
  }));

  const BATCH = 100;
  for (let i = 0; i < candles.length; i += BATCH) {
    const batch = candles.slice(i, i + BATCH);
    await Promise.all(
      batch.map(c =>
        prisma.candle.upsert({
          where: {
            instrumentId_timeframe_candleAt: {
              instrumentId: c.instrumentId,
              timeframe:    c.timeframe,
              candleAt:     c.candleAt,
            },
          },
          update: {
            open: c.open, high: c.high, low: c.low,
            close: c.close, volume: c.volume,
            source: c.source, fetchedAt: c.fetchedAt,
          },
          create: c,
        })
      )
    );
  }

  return true;
}

function sha256(arr) {
  return crypto.createHash('sha256').update(JSON.stringify(arr)).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runPhase2 };
