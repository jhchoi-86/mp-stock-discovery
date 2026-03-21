// platform/application/result_evaluator/evaluator.cjs
// RED TEAM ACTION ITEM: 3분할 크론 적용 완료
// 국내: 15:35
// 미국: 07:30
// 코인: 09:00

async function runKrEquityEvaluation() {
  console.log('[Evaluator] Running KR Equity evaluation (15:35 KST)');
  // Fetch KR signals, check close/high/low, update result
}

async function runUsEquityEvaluation() {
  console.log('[Evaluator] Running US Equity evaluation (07:30 KST)');
  // Fetch US signals, check close/high/low, update result
}

async function runCryptoEvaluation() {
  console.log('[Evaluator] Running Crypto evaluation (09:00 KST)');
  // Fetch Crypto signals, check close/high/low, update result
}

function evaluateKrEquity(signal, dayData) {
  const stopLoss = signal.entryPrice1 * 0.9;
  if (dayData.low <= stopLoss) return 'FAIL'; // Fail-Priority
  if (dayData.high >= signal.targetPrice || dayData.close >= signal.targetPrice) return 'SUCCESS';
  return 'IN_PROGRESS';
}

function evaluateUsEquity(signal, dayData) {
  const stopLoss = signal.entryPrice1 * 0.9;
  if (dayData.low <= stopLoss) return 'FAIL';
  if (dayData.high >= signal.targetPrice || dayData.close >= signal.targetPrice) return 'SUCCESS';
  return 'IN_PROGRESS';
}

function evaluateCrypto(signal, dayData) {
  const stopLoss = signal.entryPrice1 * 0.9;
  if (dayData.low <= stopLoss) return 'FAIL';
  if (dayData.high >= signal.targetPrice || dayData.close >= signal.targetPrice) return 'SUCCESS';
  return 'IN_PROGRESS';
}

module.exports = {
  runKrEquityEvaluation,
  runUsEquityEvaluation,
  runCryptoEvaluation,
  evaluateKrEquity,
  evaluateUsEquity,
  evaluateCrypto
};
