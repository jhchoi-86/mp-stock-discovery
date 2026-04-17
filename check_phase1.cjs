const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

async function checkPhase1() {
  try {
    const key = 'phase1_data_ready';
    const val = await redis.get(key);
    const ttl = await redis.ttl(key);
    console.log(`Key: ${key}`);
    console.log(`Value: ${val}`);
    console.log(`TTL: ${ttl}`);
    console.log('---');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    redis.disconnect();
  }
}

checkPhase1();
