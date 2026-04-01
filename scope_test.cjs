
const analyzer = require('./analyzer.cjs');
console.log('--- MODULE REQUIRE TEST ---');
if (typeof analyzer.calculateSignals === 'function') {
    console.log('SUCCESS: calculateSignals is exposed.');
} else {
    console.error('FAILURE: calculateSignals not found.');
    process.exit(1);
}

// Checking if resampleChartData was implicitly available inside calculateSignals
// (This test depends on how calculateSignals handles a mock)
try {
    const mock = { time: [1000, 2000, 3000, 4000], open: [1,2,3,4], high: [5,6,7,8], low: [0,0,0,0], close: [2,3,4,5], volume: [10,20,30,40] };
    const res = analyzer.calculateSignals(mock, '30M');
    console.log('SUCCESS: calculateSignals executed without ReferenceError inside (resampleChartData call).');
} catch (e) {
    console.error('FAILURE: Inner function call failed:', e.message);
    process.exit(1);
}
console.log('--- ALL SCOPE TESTS PASSED ---');
