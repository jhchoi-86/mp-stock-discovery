const PublishingService = require('../src/services/publishingService.cjs');
const pub = new PublishingService();

const testStocks = [
    { code: '005930', name: '삼성전자', currentPrice: 200500 },
    { code: '005930', name: '삼성전자', currentPrice: 201000 },
    { code: '005930', name: '삼성전자', currentPrice: 201500 },
    { code: '000660', name: 'SK하이닉스', currentPrice: 150000 }
];

async function runTest() {
    console.log('[Test] Triggering publishToAll with duplicate stocks...');
    try {
        // Mock Redis to avoid connection errors if it's offline
        const redis = require('../platform/infra/redis/client.cjs');
        redis.del = async () => console.log('[Mock] Redis del called');

        await pub.publishToAll(testStocks);
        console.log('[Test] Publish successful.');
    } catch (e) {
        console.error('[Test] Publish failed:', e.message);
    }
}

runTest();
