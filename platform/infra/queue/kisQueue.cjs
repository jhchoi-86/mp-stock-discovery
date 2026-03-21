const { Queue, Worker } = require('bullmq');

const redisConnection = { host: '127.0.0.1', port: 6379 };
// Note: Can use process.env.REDIS_URL parser for connection options in production

// KIS 제한 방지 및 OOM 방지 옵션 적용 (T2-03)
const kisQueue = new Queue('kis-api', {
  connection: redisConnection,
  defaultJobOptions: {
    delay: 120, // 초당 8건 (안전 마진)
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true, // RED TEAM ACTION ITEM: OOM 방지
    removeOnFail: { count: 100 } // RED TEAM ACTION ITEM: 실패 잡도 100개까지만 유지
  }
});

async function enqueueKisFetch(symbol, timeframe) {
  try {
    await kisQueue.add('fetch', { symbol, timeframe });
  } catch (e) {
    console.error('[BullMQ] Enqueue Error:', e.message);
  }
}

module.exports = { kisQueue, enqueueKisFetch };
