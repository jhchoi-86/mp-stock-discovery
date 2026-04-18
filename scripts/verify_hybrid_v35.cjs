'use strict';
require('dotenv').config();
const { calculateSignals } = require('../analyzer.cjs');
const { calcPPPForStock } = require('../ppp_filter.cjs');

async function verifyHybrid() {
    console.log('🛡️ [Red Team] Hybrid Alpha v3.5 Logic Integration Verification...');
    
    // 1. 샘플 종목: 천보 (278280)
    const stock = { code: '278280', name: '천보', score: 91 };
    
    console.log(`Analyzing ${stock.name}...`);
    
    // 로직 호출 (시뮬레이션 가상 통합)
    const pppRes = await calcPPPForStock(stock);
    const stdRes = await calculateSignals(await require('../analyzer.cjs').fetchHybridHistory(stock, 60, '1h', null), '2H');

    // [v3.5 통합 알고리즘 시뮬레이션]
    const currentPrice = pppRes.current_price;
    const supportLine = pppRes.result_2; // PPP 지지선
    const resistanceLine = pppRes.g_sell; // PPP 저항선
    
    // 통합 타점 설계
    const hybrid_target = Math.max(resistanceLine || 0, stdRes.result_1, Math.round(currentPrice * 1.05));
    const hybrid_entry1 = Math.max(supportLine || 0, Math.round(currentPrice * 0.98));
    const hybrid_stop = Math.round(Math.min(supportLine || hybrid_entry1, hybrid_entry1 * 0.97));

    console.log('\n--- [Comparison Results] ---');
    console.log(`Current: ${currentPrice}`);
    console.log(`[Standard] Target: ${stdRes.result_1} / Entry: ${stdRes.result_2} / Stop: ${stdRes.stop_loss}`);
    console.log(`[PPP] G-Sell: ${resistanceLine} / Support: ${supportLine}`);
    console.log(`[Hybrid v3.5] Target: ${hybrid_target} / Entry: ${hybrid_entry1} / Stop: ${hybrid_stop}`);

    // [Red Team Validation Steps]
    const errors = [];
    if (hybrid_target <= currentPrice) errors.push('ERR: Target <= Current Price');
    if (hybrid_stop >= hybrid_entry1) errors.push('ERR: Stop >= Entry Price');
    if (hybrid_entry1 > currentPrice) errors.push('ERR: Entry > Current Price (Unrealistic)');

    if (errors.length > 0) {
        console.error('\n❌ FAIL: Logic Integrity Violation!');
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    }

    console.log('\n✅ SUCCESS: Hybrid v3.5 logic generated valid, realistic targets.');
    process.exit(0);
}

verifyHybrid().catch(e => {
    console.error('💥 CRITICAL ERROR:', e);
    process.exit(1);
});
