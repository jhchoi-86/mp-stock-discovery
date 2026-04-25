'use strict';

// ──────────────────────────────────────────────────────────────────
// sync_scheduler.cjs — PM2 P5: 자동 동기화 스케줄러
// ⚠️ Phase 1 실행 시각(18:05)은 kis_lag_test.cjs 실측 후 이 1줄만 수정
// ──────────────────────────────────────────────────────────────────

require('dotenv').config();
const cron  = require('node-cron');
const dayjs = require('dayjs');

const redis = require('./platform/infra/redis/client.cjs');
const { runPhase1 }               = require('./sync/phase1_snapshot.cjs');
const { runPhase2 }               = require('./sync/phase2_fullsync.cjs');
const { startPhase3, stopPhase3 } = require('./sync/phase3_intraday.cjs');
const { sendAlert }               = require('./lib/alert_manager.cjs');

// [v9.5.4] Scheduler Flags
let phase1Running = false;
let phase2Running = false;

cron.schedule('5 18 * * 1-5', async () => {
  if (phase1Running) { console.log('[Scheduler] Phase 1 이미 실행 중 — skip'); return; }
  
  const manualLock = await redis.get('manual_sync_lock');
  if (manualLock) {
    console.log('[Scheduler] Manual Sync 진행 중 — Phase 1 지연');
    return;
  }

  phase1Running = true;
  console.log('[Scheduler] Phase 1 시작 (18:05 자동)');
  try {
    await runPhase1();
  } catch (err) {
    console.error('[Scheduler] Phase 1 오류:', err.message);
    await sendAlert('CRITICAL', 'scheduler_phase1_error', `Phase 1 자동 실행 실패: ${err.message}`);
  } finally {
    phase1Running = false;
  }
}, { timezone: 'Asia/Seoul' });

cron.schedule('20 18 * * 1-5', async () => {
  if (phase1Running) return;
  const success = await redis.get('phase1_success').catch(() => null);
  if (success === 'true') return;

  const manualLock = await redis.get('manual_sync_lock');
  if (manualLock) return;

  console.log('[Scheduler] Phase 1 재시도 (18:20)');
  phase1Running = true;
  try {
    await runPhase1();
  } catch (err) {
    console.error('[Scheduler] Phase 1 재시도 오류:', err.message);
    await sendAlert('CRITICAL', 'scheduler_phase1_retry_error', `Phase 1 재시도 실패: ${err.message}`);
  } finally {
    phase1Running = false;
  }
}, { timezone: 'Asia/Seoul' });

cron.schedule('0 6 * * 1-5', async () => {
  if (phase2Running) { console.log('[Scheduler] Phase 2 이미 실행 중 — skip'); return; }
  
  const [aLock, mLock] = await Promise.all([
    redis.get('analyzer_lock'),
    redis.get('manual_sync_lock')
  ]);
  if (aLock || mLock) {
    console.log('[Scheduler] Analyzer/Manual Lock 활성 상태 — Phase 2 지연');
    return;
  }

  phase2Running = true;
  console.log('[Scheduler] Phase 2 시작 (06:00 자동)');
  try {
    await runPhase2();

    // [FullSync] Phase 2 완료
    console.log('[FullSync] Phase 2 정기 동기화 완료');
  } catch (err) {
    console.error('[Scheduler] Phase 2 오류:', err.message);
    await sendAlert('CRITICAL', 'scheduler_phase2_error', `Phase 2 자동 실행 실패: ${err.message}`);
  } finally {
    phase2Running = false;
  }
}, { timezone: 'Asia/Seoul' });

cron.schedule('0 9 * * 1-5', () => {
  console.log('[Scheduler] Phase 3 시작 (09:00)');
  startPhase3().catch(err => {
    console.error('[Scheduler] Phase 3 시작 오류:', err.message);
    sendAlert('CRITICAL', 'scheduler_phase3_start_error', `Phase 3 시작 실패: ${err.message}`);
  });
}, { timezone: 'Asia/Seoul' });

cron.schedule('30 15 * * 1-5', () => {
  console.log('[Scheduler] Phase 3 종료 (15:30 안전망)');
  stopPhase3().catch(err => {
    console.error('[Scheduler] Phase 3 종료 오류:', err.message);
  });
}, { timezone: 'Asia/Seoul' });

(function recoverOnRestart() {
  const now = dayjs();
  const h   = now.hour();
  const m   = now.minute();
  const isWeekday = now.day() >= 1 && now.day() <= 5;

  const isIntraday = isWeekday && (
    (h === 9) || (h > 9 && h < 15) || (h === 15 && m < 30)
  );

  if (isIntraday) {
    console.log(`[Scheduler] PM2 재시작 감지 — 장중 Phase 3 즉시 재개 (${now.format('HH:mm')})`);
    startPhase3().catch(err => {
      console.error('[Scheduler] Phase 3 복구 시작 오류:', err.message);
    });
  } else {
    console.log(`[Scheduler] 스케줄러 대기 중 (${now.format('YYYY-MM-DD HH:mm')})`);
  }
})();

process.on('SIGTERM', async () => {
  console.log('[Scheduler] SIGTERM 수신 — graceful shutdown');
  await stopPhase3().catch(() => {});
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Scheduler] SIGINT 수신 — graceful shutdown');
  await stopPhase3().catch(() => {});
  process.exit(0);
});

console.log('[Scheduler] sync_scheduler.cjs 기동 완료 (TZ: Asia/Seoul)');
