const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

async function checkRedis() {
  try {
    const keys = await Promise.all([
      redis.keys('phase*'),
      redis.keys('*lock*'),
      redis.get('phase1_data_ready'),
      redis.get('phase1_success'),
      redis.get('phase1_snapshot_ts'),
      redis.get('phase2_complete_ts'),
      redis.get('analyzer_lock'),
      redis.get('manual_sync_lock')
    ]);

    console.log('--- Redis State ---');
    console.log('Phase keys:', keys[0]);
    console.log('Lock keys:', keys[1]);
    console.log('phase1_data_ready:', keys[2]);
    console.log('phase1_success:', keys[3]);
    console.log('phase1_snapshot_ts:', keys[4]);
    console.log('phase2_complete_ts:', keys[5]);
    console.log('analyzer_lock:', keys[6]);
    console.log('manual_sync_lock:', keys[7]);

    if (keys[6] || keys[7]) {
      console.log('Deleting locks...');
      const keysToDelete = [
        'analyzer_lock',
        'manual_sync_lock',
        'phase1_data_ready',
        'phase1_success',
        'phase1_snapshot_ts',
        'phase2_last_sync_ts'
      ];
      await redis.del(...keysToDelete);
      console.log('Locks deleted.');
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    redis.disconnect();
  }
}

checkRedis();
