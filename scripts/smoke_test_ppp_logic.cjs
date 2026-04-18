'use strict';
require('dotenv').config();
const { calcPPPForStock } = require('../ppp_filter.cjs');

async function verify() {
    console.log('🛡️ [Red Team] LG Innotek Breakout Logic Verification (v9.7.8 Patch)...');
    
    const stocks = [
        { code: '011070', name: 'LG이노텍' },
        { code: '278280', name: '천보' }
    ];

    for (const stock of stocks) {
        console.log(`\nChecking ${stock.name}(${stock.code})...`);
        const result = await calcPPPForStock(stock);
        
        if (!result) {
            console.error(`❌ FAIL: Result for ${stock.name} is null`);
            continue;
        }

        console.log(`- Price: ${result.current_price}`);
        console.log(`- G-Sell: ${result.g_sell}`);
        console.log(`- Result_2 (Support): ${result.result_2}`);
        console.log(`- PPP1 (Breakout): ${result.ppp1}`);
        console.log(`- PPP2 (S/R Flip): ${result.ppp2}`);

        if (stock.code === '011070') {
            if (result.ppp1 || result.ppp2) {
                console.log('✅ SUCCESS: LG Innotek Breakout Detected!');
            } else {
                console.log('⚠️ INFO: LG Innotek did not trigger breakout in current timeframe data.');
            }
        }
    }
    process.exit(0);
}

verify().catch(e => {
    console.error('💥 CRITICAL ERROR:', e);
    process.exit(1);
});
