const redis = require('./platform/infra/redis/client.cjs');
async function listKeys() {
    try {
        const keys = await redis.keys('mp:top*');
        console.log('--- REDIS KEYS MATCHING mp:top* ---');
        console.log(keys);
        for (const key of keys) {
            const val = await redis.get(key);
            console.log(`Key: ${key}`);
            // Show only first stock to save space
            const data = JSON.parse(val);
            if (Array.isArray(data) && data.length > 0) {
                console.log('First stock entry:', JSON.stringify(data[0], null, 2));
            }
        }
    } catch (e) {
        console.error('Failed to list Redis keys:', e);
    } finally {
        process.exit(0);
    }
}
listKeys();
