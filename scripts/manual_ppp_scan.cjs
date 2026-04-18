const { runPppScan } = require('../ppp_filter.cjs');
async function run() {
    process.env.TZ = 'Asia/Seoul';
    console.log('[Manual Scan] Starting at:', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
    try {
        const result = await runPppScan();
        console.log('[Manual Scan] Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('[Manual Scan] Error:', e.message);
    }
}
run();
