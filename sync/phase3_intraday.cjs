'use strict';
process.env.TZ = 'Asia/Seoul'; // [TASK-CC02] Global KST Enforcement

// ──────────────────────────────────────────────────────────────────
// sync/phase3_intraday.cjs — Phase 3: 장중 증분 (베이스라인 Delta)
// ──────────────────────────────────────────────────────────────────

require('dotenv').config();
const dayjs  = require('dayjs');
const pLimit = require('p-limit');
const { PrismaClient } = require('@prisma/client');

const redis = require('../platform/infra/redis/client.cjs');
const { getToken } = require('../lib/token_manager.cjs');
const { sendAlert } = require('../lib/alert_manager.cjs');
const {
  TIMEFRAMES,
  TF_CONFIRMED_RULES,
  TF_TO_YAHOO_INTERVAL,
  TF_FETCH_DAYS,
  TF_RESAMPLE_MAP,
} = require('../lib/constants.cjs');
const { fetchHybridHistory, resampleChartData, runBatchAnalysis } = require('../analyzer.cjs');
const { getKstISO, nowKST, getKstNow } = require('../src/utils/kst.cjs'); // [TASK-CC02]

const prisma = new PrismaClient();

let loopTimer       = null;
let heartbeatTimer  = null;
let isRunning       = false;
let buffer1520      = [];

const CONCURRENCY   = 20;
const TIMEOUT_MS    = 5000;

async function startPhase3() {
  if (isRunning) {
    console.log('[Phase3] 이미 실행 중 — 중복 시작 방지');
    return;
  }

  isRunning = true;
  console.log('[Phase3] 장중 증분 루프 시작');

  await checkBaseline();

  heartbeatTimer = setInterval(() => {
    try {
      redis.publish('sse_heartbeat', JSON.stringify({ type: 'heartbeat', ts: nowKST() })); // [TASK-CC02] KST ms
    } catch (err) {}
  }, 30000);

  await runLoop();
  scheduleNextLoop();
}

async function stopPhase3() {
  isRunning = false;
  if (loopTimer)      { clearTimeout(loopTimer);      loopTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  if (buffer1520.length > 0) {
    console.log(`[Phase3] 15:30 버퍼 flush — ${buffer1520.length}종목`);
    await flushBuffer();
  }

  console.log('[Phase3] 장중 루프 중지');
}

function scheduleNextLoop() {
  if (!isRunning) return;

  const now    = dayjs();
  const h      = now.hour();
  const m      = now.minute();

  let interval;
  if (h === 9 && m < 5) {
    interval = 3000;
  } else if (h < 15 || (h === 15 && m < 20)) {
    interval = 60000;
  } else if (h === 15 && m < 30) {
    interval = 30000;
  } else {
    stopPhase3();
    return;
  }

  loopTimer = setTimeout(async () => {
    await runLoop();
    scheduleNextLoop();
  }, interval);
}

async function runLoop() {
  if (!isRunning) return;

  const now = dayjs();
  const h   = now.hour();
  const m   = now.minute();
  const isBufferTime = (h === 15 && m >= 20 && m < 30);

  try {
    const instruments = await prisma.instrument.findMany({ where: { isActive: true } });
    const kisToken    = await getToken().catch(() => null);
    const limit       = pLimit(CONCURRENCY);
    const changedSymbols = new Set();

    await Promise.all(instruments.map(inst =>
      limit(async () => {
        const halted = await redis.get(`circuit_break:${inst.symbol}`);
        if (halted) return;

        const fetchCache = {};

        for (const tf of TIMEFRAMES) {
          const isConfirmed = TF_CONFIRMED_RULES[tf]?.(now) ?? true;
          if (!isConfirmed) continue;

          try {
            const resampleInfo = TF_RESAMPLE_MAP[tf];
            let history;

            if (resampleInfo) {
              const { sourceTf, factor } = resampleInfo;
              if (!fetchCache[sourceTf]) {
                fetchCache[sourceTf] = await fetchWithTimeout(inst, sourceTf, kisToken);
              }
              if (!fetchCache[sourceTf]) continue;
              history = resampleChartData(fetchCache[sourceTf], factor, tf);
            } else {
              if (!fetchCache[tf]) {
                fetchCache[tf] = await fetchWithTimeout(inst, tf, kisToken);
              }
              history = fetchCache[tf];
            }

            if (!history || !history.close || history.close.length === 0) continue;

            const lastIdx     = history.close.length - 1;
            const apiCandleAt = new Date(history.time[lastIdx] * 1000);
            const apiClose    = history.close[lastIdx];
            const apiVolume   = history.volume[lastIdx] ?? 0;

            if (history.halt_yn === 'Y') {
              await redis.set(`circuit_break:${inst.symbol}`, '1', 'EX', 86400);
              await sendAlert('INFO', `circuit_${inst.symbol}`, `거래정지: ${inst.symbol}`);
              return;
            }

            const changed = await detectDelta(inst.id, tf, apiCandleAt, apiClose, apiVolume);
            if (!changed) continue;

            if (isBufferTime) {
              buffer1520.push({ inst, tf, history });
            } else {
              await upsertCandle(inst.id, tf, history, lastIdx, 'INTRADAY');
              changedSymbols.add(inst.symbol);
            }

          } catch (err) {
            console.debug(`[Phase3] ${inst.symbol} ${tf} 오류: ${err.message}`);
          }
        }
      })
    ));

    if (changedSymbols.size > 0) {
      await runBatchAnalysis([...changedSymbols], TIMEFRAMES, { useDBCache: true });
      redis.publish('sse_event', JSON.stringify({
        type: 'data_update',
        changedCount: changedSymbols.size,
        ts: nowKST(), // [TASK-CC02] KST ms
      }));
      console.log(`[Phase3] ${changedSymbols.size}종목 변경 감지 → analyzer 완료`);
    }

  } catch (err) {
    console.error('[Phase3] 루프 오류:', err.message);
  }
}

async function flushBuffer() {
  const changedSymbols = new Set();

  for (const { inst, tf, history } of buffer1520) {
    const lastIdx     = history.close.length - 1;
    const apiCandleAt = new Date(history.time[lastIdx] * 1000);
    const apiClose    = history.close[lastIdx];
    const apiVolume   = history.volume[lastIdx] ?? 0;

    const changed = await detectDelta(inst.id, tf, apiCandleAt, apiClose, apiVolume);
    if (changed) {
      await upsertCandle(inst.id, tf, history, lastIdx, 'INTRADAY');
      changedSymbols.add(inst.symbol);
    }
  }

  buffer1520 = [];

  if (changedSymbols.size > 0) {
    await runBatchAnalysis([...changedSymbols], TIMEFRAMES, { useDBCache: true });
    redis.publish('sse_event', JSON.stringify({
      type: 'data_update',
      changedCount: changedSymbols.size,
      ts: nowKST(), // [TASK-CC02] KST ms
    }));
  }
}

async function detectDelta(instrumentId, tf, apiCandleAt, apiClose, apiVolume) {
  const dbLast = await prisma.candle.findFirst({
    where: {
      instrumentId,
      timeframe: tf,
      candleAt: { lte: apiCandleAt },
    },
    orderBy: { candleAt: 'desc' },
  });

  if (!dbLast) return true;
  return dbLast.close !== apiClose || dbLast.volume !== apiVolume;
}

async function upsertCandle(instrumentId, tf, history, idx, source) {
  const candleAt = new Date(history.time[idx] * 1000);
  await prisma.candle.upsert({
    where: {
      instrumentId_timeframe_candleAt: { instrumentId, timeframe: tf, candleAt },
    },
    update: {
      open:      history.open[idx]   ?? history.close[idx],
      high:      history.high[idx]   ?? history.close[idx],
      low:       history.low[idx]    ?? history.close[idx],
      close:     history.close[idx],
      volume:    history.volume[idx] ?? 0,
      source,
      fetchedAt: getKstNow(), // [TASK-CC02] KST DB 저장
    },
    create: {
      instrumentId,
      timeframe:  tf,
      open:       history.open[idx]   ?? history.close[idx],
      high:       history.high[idx]   ?? history.close[idx],
      low:        history.low[idx]    ?? history.close[idx],
      close:      history.close[idx],
      volume:     history.volume[idx] ?? 0,
      source,
      isValid:    true,
      fetchedAt:  getKstNow(), // [TASK-CC02] KST DB 저장
      candleAt,
    },
  });
}

async function fetchWithTimeout(inst, tf, kisToken) {
  const interval = TF_TO_YAHOO_INTERVAL[tf];
  const days     = TF_FETCH_DAYS[tf];
  const stock    = { code: inst.symbol, name: inst.name, market: inst.market || 'KOSPI' };

  return Promise.race([
    fetchHybridHistory(stock, days, interval, kisToken, null),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('타임아웃')), TIMEOUT_MS)
    ),
  ]).catch(() => null);
}

async function checkBaseline() {
  const baseline   = await redis.get('phase1_baseline_ts');
  const phase2Ts   = await redis.get('phase2_complete_ts');

  if (!baseline && !phase2Ts) {
    await sendAlert('WARN', 'phase3_no_baseline',
      'Phase 3 베이스라인 없음 — 당일 00:00 기준 전체 재수집으로 대체');
    console.warn('[Phase3] 베이스라인 없음 — fallback: 당일 00:00 기준');
  } else {
    const usedTs = baseline || phase2Ts;
    console.log(`[Phase3] 베이스라인: ${usedTs}`);
  }
}

module.exports = { startPhase3, stopPhase3 };
