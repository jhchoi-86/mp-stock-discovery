const redis = require('./platform/infra/redis/client.cjs');
async function clearCache() {
    try {
        const keys = ['mp:top:5', 'mp:top:10', 'mp:top:20'];
        for (const key of keys) {
            await redis.del(key);
            console.log(`Deleted Redis key: ${key}`);
        }
    } catch (e) {
        console.error('Failed to clear Redis:', e);
    } finally {
        process.exit(0);
    }
}
clearCache();
