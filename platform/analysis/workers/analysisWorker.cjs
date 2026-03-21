const { workerData, parentPort } = require('worker_threads');
const path = require('path');

// Legacy analyzer is safely preserved and required from root
let calculateSignals;
try {
  const analyzerMod = require('../../../../analyzer.cjs');
  calculateSignals = analyzerMod.calculateSignals;
} catch(e) {
  // Mock if analyzer doesn't exist yet for testing
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
