const { computeIndicators, calculateScore } = require('./scoringEngine.cjs');

console.log("==========================================");
console.log("🔴 Red Team's Edge-Case & Defense Testing");
console.log("==========================================\n");

// [Test 1] All conditions met perfectly
const data1 = {
    open: 10300, prev_close: 10000, // +3% -> 100
    current_vol: 350000, avg_prev_5d_vol: 100000, // 350% -> 100
    current_price: 10400, vwap: 10300, // ~100.97% -> 100
    buy_ticks: 13000, sell_ticks: 10000, // 130% -> 100
    ask_volume_sum: 20000, bid_volume_sum: 10000 // 2.0x -> 100
};
console.log("[Test 1] Perfect Score Case (Expected Total = 500)");
const ind1 = computeIndicators(data1);
console.log(" Indicators:", ind1);
console.log(" Scores:", calculateScore(ind1), "\n");

// [Test 2] Negative score case + Edge overlaps
const data2 = {
    open: 10000, prev_close: 10000, // 0% -> 50
    current_vol: 150000, avg_prev_5d_vol: 100000, // 150% -> 0
    current_price: 9000, vwap: 10000, // 90% -> -100
    buy_ticks: 9000, sell_ticks: 10000, // 90% -> 0
    ask_volume_sum: 5000, bid_volume_sum: 10000 // 0.5x -> 0
};
console.log("[Test 2] Terrible Case with -100 VWAP (Expected Total = 0 due to Math.max(0, ...))");
const ind2 = computeIndicators(data2);
console.log(" Indicators:", ind2);
console.log(" Scores:", calculateScore(ind2), "\n");

// [Test 3] Zero Division Edge Cases (Simulating no input / completely broken state)
const data3 = {
    open: 10000, prev_close: 0, 
    current_vol: 100000, avg_prev_5d_vol: 0, 
    current_price: 10000, vwap: 0, 
    buy_ticks: 10000, sell_ticks: 0, 
    ask_volume_sum: 10000, bid_volume_sum: 0 
};
console.log("[Test 3] Zero Division Vulnerability Check (Should NOT crash, Infinity or NaN prevented nicely)");
const ind3 = computeIndicators(data3);
console.log(" Indicators:", ind3);
console.log(" Scores:", calculateScore(ind3), "\n");

console.log("ALL TESTS EXECUTED. RED TEAM CHECK COMPLETE.");
