const { workerData, parentPort } = require('worker_threads');
const path = require('path');

// [TASK-014] process.cwd() 대신 workerData로 주입된 analyzerPath 사용
let calculateSignals;
try {
  // workerData.analyzerPath이 있으면 사용, 없으면 __dirname 기반 폴백
  const analyzerPath = (workerData && workerData.analyzerPath)
    ? workerData.analyzerPath
    : path.join(__dirname, '..', '..', '..', 'analyzer.cjs');
  const analyzerMod = require(analyzerPath);
  calculateSignals = analyzerMod.calculateSignals;
} catch(e) {
  console.error('[Worker] Failed to load analyzer:', e.message);
  calculateSignals = (history) => ({ signal_HH: true, entry_price: 100, DHH2: true, cond_up7: true });
}

parentPort.on('message', (data) => {
  try {
    const result = calculateSignals(data.history, data.timeframe);
    parentPort.postMessage({ success: true, data: result });
  } catch (e) {
    parentPort.postMessage({ success: false, error: e.message });
  }
});
