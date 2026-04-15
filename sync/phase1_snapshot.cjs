'use strict';

// ──────────────────────────────────────────────────────────────────
// sync/phase1_snapshot.cjs — Phase 1: 장마감 후 사전 DB 저장
// 목적: analyzer 실행 없음. 7TF 원본 캔들 데이터 수집 → DB 저장만.
// ──────────────────────────────────────────────────────────────────

require('dotenv').config();
const dayjs = require('dayjs');
const pLimit = require('p-limit');
const { PrismaClient } = require('@prisma/client');

const redis = require('../platform/infra/redis/client.cjs');
const { getToken } = require('../lib/token_manager.cjs');
const { sendAlert } = require('../lib/alert_manager.cjs');
const {
  TIMEFRAMES,
  TF_TO_YAHOO_INTERVAL,
  TF_FETCH_DAYS,
  TF_RESAMPLE_MAP,
} = require('../lib/constants.cjs');

const {
  fetchHybridHistory,
  resampleChartData,
} = require('../analyzer.cjs');

const prisma = new PrismaClient();

const CONCURRENCY = 20;
const TIMEOUT_MS  = 5000;
const MAX_RETRY   = 3;

async function runPhase1() {
  const startTs = Date.now();
  const today   = dayjs().format('YYYYMMDD');

  console.log(`[Phase1] 사전 저장 시작 — ${today}`);

  let instruments = [];
  try {
    const rawLimit = process.env.SNAPSHOT_TICKER_LIMIT;
    const take     = rawLimit && parseInt(rawLimit) > 0 ? parseInt(rawLimit) : undefined;

    instruments = await prisma.instrument.findMany({
      where: { isActive: true },
      ...(take ? { take } : {}),
    });

    console.log(`[Phase1] 활성 종목: ${instruments.length}개`);
  } catch (err) {
    await sendAlert('CRITICAL', 'phase1_db_error', `종목 조회 실패: ${err.message}`);
    throw err;
  }

  const kisToken     = await getToken().catch(() => null);
  const limit        = pLimit(CONCURRENCY);
  let successCount   = 0;
  let failCount      = 0;

  const tasks = instruments.map(inst =>
    limit(async () => {
      try {
        await fetchAndSaveInstrument(inst, kisToken);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(`[Phase1] 실패 ${inst.symbol}:`, err.message);
      }
    })
  );

  await Promise.all(tasks);

  const total       = instruments.length;
  const successRate = total > 0 ? successCount / total : 0;
  const elapsed     = ((Date.now() - startTs) / 1000).toFixed(1);
  const nowIso      = new Date().toISOString();
  const success     = successRate >= 0.80;

  await Promise.all([
    redis.set('phase1_data_ready',   today,                'EX', 86400),
    redis.set('phase1_snapshot_ts',  nowIso,               'EX', 86400),
    redis.set('phase1_ticker_count', String(successCount), 'EX', 86400),
    redis.set('phase1_success',      String(success),      'EX', 86400),
    redis.set('phase1_baseline_ts',  nowIso,               'EX', 86400),
  ]);

  console.log(`[Phase1] 완료 — ${successCount}/${total}종목 (${elapsed}초) 성공률: ${(successRate*100).toFixed(1)}%`);

  if (successRate < 0.80) {
    await sendAlert('CRITICAL', 'phase1_low_success',
      `사전저장 성공률 위험 | ${today} | ${successCount}/${total}종목 | ${elapsed}초`);
  } else if (successRate < 0.95) {
    await sendAlert('WARN', 'phase1_warn_success',
      `사전저장 성공률 경고 | ${today} | ${successCount}/${total}종목 | ${elapsed}초`);
  } else {
    await sendAlert('INFO', 'phase1_complete',
      `사전저장 완료 | ${today} | ${successCount}종목 × 7TF | 소요 ${elapsed}초`);
  }
}

async function fetchAndSaveInstrument(inst, kisToken) {
  const fetchCache = {};

  for (const tf of TIMEFRAMES) {
    const resampleInfo = TF_RESAMPLE_MAP[tf];

    let history;
    if (resampleInfo) {
      const { sourceTf, factor } = resampleInfo;
      if (!fetchCache[sourceTf]) {
        fetchCache[sourceTf] = await fetchWithRetry(inst, sourceTf, kisToken);
      }
      history = resampleChartData(fetchCache[sourceTf], factor, tf);
    } else {
      if (!fetchCache[tf]) {
        fetchCache[tf] = await fetchWithRetry(inst, tf, kisToken);
      }
      history = fetchCache[tf];
    }

    if (!history || !history.close || history.close.length === 0) {
      console.warn(`[Phase1] ${inst.symbol} ${tf}: 데이터 없음 — skip`);
      continue;
    }

    await saveCandles(inst.id, tf, history);
  }
}

async function fetchWithRetry(inst, tf, kisToken) {
  const interval = TF_TO_YAHOO_INTERVAL[tf];
  const days     = TF_FETCH_DAYS[tf];
  const stock    = { code: inst.symbol, name: inst.name, market: inst.market || 'KOSPI' };

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const history = await Promise.race([
        fetchHybridHistory(stock, days, interval, kisToken, null),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('타임아웃')), TIMEOUT_MS)
        ),
      ]);
      return history;
    } catch (err) {
      if (attempt === MAX_RETRY) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[Phase1] ${inst.symbol} ${tf} retry ${attempt}/${MAX_RETRY}: ${err.message}`);
      await sleep(delay);
    }
  }
}

async function saveCandles(instrumentId, timeframe, history) {
  const { open, high, low, close, volume, time: timeArr } = history;
  if (!close || close.length === 0) return;

  const candles = close.map((c, i) => ({
    instrumentId,
    timeframe,
    open:      open[i]   ?? c,
    high:      high[i]   ?? c,
    low:       low[i]    ?? c,
    close:     c,
    volume:    volume[i] ?? 0,
    source:    'SNAPSHOT',
    isValid:   true,
    fetchedAt: new Date(),
    candleAt:  new Date(timeArr[i] * 1000),
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
            open:      c.open,
            high:      c.high,
            low:       c.low,
            close:     c.close,
            volume:    c.volume,
            source:    c.source,
            fetchedAt: c.fetchedAt,
          },
          create: c,
        })
      )
    );
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runPhase1 };
