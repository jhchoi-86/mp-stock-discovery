const redis = require('../platform/infra/redis/client.cjs');
async function run() {
    process.env.TZ = 'Asia/Seoul';
    console.log('[Redis] Flushing KIS cache...');
    try {
        await redis.del('kis:access_token');
        await redis.del('kis:approval_key');
        console.log('[Redis] DONE');
    } catch (e) {
        console.error('[Redis] Error:', e.message);
    } finally {
        process.exit(0);
    }
}
run();
