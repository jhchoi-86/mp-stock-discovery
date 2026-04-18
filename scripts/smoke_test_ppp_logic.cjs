require('dotenv').config();
const { calcPPPForStock } = require('../ppp_filter.cjs');

async function verify() {
    console.log('🛡️ [Red Team] PPP Data Integrity Logic Verification (v9.7.8 Patch)...');
    
    // 1. 천보 (278280) - 결측 발생 종목 샘플
    const stock = { code: '278280', name: '천보', score: 91 };
    console.log(`Checking ${stock.name}(${stock.code})...`);
    
    const result = await calcPPPForStock(stock);
    
    if (!result) {
        console.error('❌ FAIL: Result is null (Data fetch failed)');
        process.exit(1);
    }

    console.log('Result Data:', JSON.stringify(result, null, 2));

    const errors = [];
    if (result.current_price === null) errors.push('current_price is NULL');
    if (result.g_sell === null) errors.push('g_sell is NULL');
    if (result.result_2 === null) errors.push('result_2 is NULL (Binding Bug Check)');
    
    if (errors.length > 0) {
        console.error('❌ FAIL: Data Missing Detected!');
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    }

    console.log('✅ SUCCESS: All fields (Price, G-Sell, Support) are populated.');
    process.exit(0);
}

verify().catch(e => {
    console.error('💥 CRITICAL ERROR:', e);
    process.exit(1);
});
