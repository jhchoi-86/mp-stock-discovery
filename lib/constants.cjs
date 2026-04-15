'use strict';

// ──────────────────────────────────────────────────────────────────
// lib/constants.cjs — 전체 파이프라인 공통 상수 (SSOT)
// MP-TASK-2026-003 v2.1
// ──────────────────────────────────────────────────────────────────

const TIMEFRAMES = ['30M', '1H', '2H', '4H', '1D', '2D', '1W'];

const TF_CONFIRMED_RULES = {
  '30M': (now) => now.minute() >= 1,
  '1H':  (now) => now.minute() >= 1,
  '2H':  (now) => now.minute() >= 1 && now.hour() % 2 === 0,
  '4H':  (now) => now.minute() >= 1 && now.hour() % 4 === 0,
  '1D':  (now) => now.hour() > 15 || (now.hour() === 15 && now.minute() >= 30),
  '2D':  (now) => now.hour() > 15 || (now.hour() === 15 && now.minute() >= 30),
  '1W':  (now) => now.day() === 5 && (now.hour() > 15 || (now.hour() === 15 && now.minute() >= 30)),
};

// C-03: 실측 후 이 값을 업데이트
// 실측: time node -e "require('./analyzer.cjs').runBatchAnalysis(null,['1D'],{})"
const ANALYZER_LOCK_TTL = 1800;

const TF_TO_YAHOO_INTERVAL = {
  '30M': '30m',
  '1H':  '1h',
  '2H':  '1h',
  '4H':  '1h',
  '1D':  '1d',
  '2D':  '1d',
  '1W':  '1wk',
};

const TF_FETCH_DAYS = {
  '30M': 30,
  '1H':  60,
  '2H':  60,
  '4H':  90,
  '1D':  365,
  '2D':  365,
  '1W':  730,
};

const TF_RESAMPLE_MAP = {
  '2H': { sourceTf: '1H', factor: 2 },
  '4H': { sourceTf: '1H', factor: 4 },
  '2D': { sourceTf: '1D', factor: 2 },
};

module.exports = {
  TIMEFRAMES,
  TF_CONFIRMED_RULES,
  ANALYZER_LOCK_TTL,
  TF_TO_YAHOO_INTERVAL,
  TF_FETCH_DAYS,
  TF_RESAMPLE_MAP,
};
