const { calculateDisplayScore } = require('./platform/analysis/scoring/scorer.cjs');

// Test Case: 모든 조건 충족 (DHH2, cond_up7, trigger_vol, isTrending, entry_approved)
// 스네이크 케이스 필드 인식 확인
const testSignal = { 
  DHH2: true, 
  cond_up7: true, 
  trigger_vol: true, 
  trigger_rsi: true, 
  isTrending: true, 
  entry_approved: true 
};

const result = calculateDisplayScore(testSignal);
console.log('--- Scorer Validation ---');
console.log('Input Signal:', JSON.stringify(testSignal, null, 2));
console.log('Calculated Score:', result.total);
console.log('Breakdown Items (Checked):');
result.breakdown.forEach(item => {
  console.log(` - [${item.pass ? 'PASS' : 'FAIL'}] ${item.label}: ${item.score}pts`);
});

// 예상: DHH2&&cond_up7(25) + cond_up7(20) + DHH2(20) + trigger_vol(15) + trigger_rsi(10) + isTrending(5) + entry_approved(5) = 100
if (result.total === 100) {
  console.log('\n[SUCCESS] Scorer successfully recognized snake_case fields and capped at 100.');
} else {
  console.error(`\n[FAILURE] Scorer result ${result.total} does not match expected 100.`);
  process.exit(1);
}
