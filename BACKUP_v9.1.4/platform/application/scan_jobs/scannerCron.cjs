// [Track 1] 백그라운드 자동 발굴 스캐너 (15M, 1H 등 핵심 2개만 집중 스캔)
const bullmq = require('../../infra/queue/kisQueue.cjs');
// const prisma = require('../../infra/db/prismaClient.cjs');

async function runBackgroundScan() {
  console.log('[ScannerCron] Starting background scan for 15m, 1h...');
  // Mock DB query since Prisma is not fully initialized in this sandbox yet
  const instruments = [ { id: 1, symbol: '005930', isActive: true } ]; 
  
  const TARGET_TIMEFRAMES = ['15m', '1h']; // 핵심 2개만 스캔
  
  for (const inst of instruments) {
    if (!inst.isActive) continue;
    for (const tf of TARGET_TIMEFRAMES) {
      await bullmq.enqueueKisFetch(inst.symbol, tf);
    }
  }
}

// Scheduled in server.cjs or external cron (e.g. '*/15 * * * *')
module.exports = { runBackgroundScan };
