const { calcPPPForStock } = require('../ppp_filter.cjs');

async function run() {
    process.env.TZ = 'Asia/Seoul';
    const stock = {
        code: '005930',
        name: '삼성전자',
        score: 75,
        market: 'KOSPI'
    };
    console.log(`[Test] Running MTF analysis for ${stock.name} (${stock.code})...`);
    try {
        const result = await calcPPPForStock(stock);
        if (!result) {
            console.log('[Test] 분석 실패 (No data or filtered)');
            return;
        }

        console.log('[Test] Analysis Result Summary:', {
            code: result.code,
            name: result.name,
            matched_tfs: result.matched_tfs,
            g_sell: result.g_sell,
            current_price: result.current_price
        });
        
        console.log('[Test] tf_values Preview:');
        const tfValues = JSON.parse(result.tf_values);
        Object.keys(tfValues).forEach(tf => {
            const data = tfValues[tf];
            console.log(`  - ${tf}: gSell=${data.gSell}, Support=${data.result2}`);
        });
    } catch (e) {
        console.error('[Test] Error:', e.message);
    }
}
run();
