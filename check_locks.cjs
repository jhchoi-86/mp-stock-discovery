const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

async function checkLocks() {
  try {
    const keys = ['manual_sync_lock', 'analyzer_lock'];
    for (const key of keys) {
      const val = await redis.get(key);
      const ttl = await redis.ttl(key);
      console.log(`Key: ${key}`);
      console.log(`Value: ${val}`);
      console.log(`TTL: ${ttl}`);
      console.log('---');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    redis.disconnect();
  }
}

checkLocks();
