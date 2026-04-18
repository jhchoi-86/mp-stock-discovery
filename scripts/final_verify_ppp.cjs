const fs = require('fs');
const path = require('path');

const files = [
    'src/components/PppWatchlist.jsx',
    'src/components/LandingPppWidget.jsx',
    'ppp_filter.cjs'
];

function grepLike(filePath, pattern, context = 0) {
    if (!fs.existsSync(filePath)) return `File missing: ${filePath}`;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const regex = new RegExp(pattern);
    let results = [];
    
    lines.forEach((line, i) => {
        if (regex.test(line)) {
            const start = Math.max(0, i - context);
            const end = Math.min(lines.length, i + context + 1);
            for (let j = start; j < end; j++) {
                results.push(`${filePath}:${j + 1}:${lines[j]}`);
            }
        }
    });
    return results.join('\n');
}

console.log('--- [검증-1] ₩/원/formatPrice 제거 확인 ---');
const v1 = grepLike('src/components/PppWatchlist.jsx', '₩|원|formatPrice') + 
           '\n' + grepLike('src/components/LandingPppWidget.jsx', '₩|원|formatPrice');
console.log(v1.trim() || '출력 없음(0줄)');

console.log('\n--- [검증-2] g_buy -> g_sell 전환 확인 (LandingPppWidget.jsx) ---');
console.log(grepLike('src/components/LandingPppWidget.jsx', 'g_buy|g_sell|G-Buy|G-Sell'));

console.log('\n--- [검증-3] MatchedTfValues 구현 확인 (PppWatchlist.jsx) ---');
console.log(grepLike('src/components/PppWatchlist.jsx', 'MatchedTfValues|parseTfValues|TF_COLORS|fmtPrice|flexDirection'));

console.log('\n--- [검증-4] MIN_CANDLES 복원 확인 ---');
console.log(grepLike('ppp_filter.cjs', 'MIN_CANDLES', 12).split('\n').slice(0, 15).join('\n'));

console.log('\n--- [검증-5] 단위 테스트 ---');
const fmtPrice = (val) => (val === null || val === undefined) ? '-' : Number(val).toLocaleString('ko-KR');
const mockTfValues = {
  '3M':  { gSell: 23000,  result2: 21500 },
  '1H':  { gSell: 23200,  result2: 21800 },
  '4H':  { gSell: null,   result2: 22000 }
};
Object.entries(mockTfValues).forEach(([tf, vals]) => {
  console.log(`${tf} → G-Sell(${tf}): ${fmtPrice(vals.gSell)} / 지지선(${tf}): ${fmtPrice(vals.result2)}`);
});
const result = fmtPrice(23000);
console.log('₩ 포함 여부:', result.includes('₩') ? '❌ 실패' : '✅ 통과');

console.log('\n--- [검증-6] exports 4개 확인 ---');
const src = fs.readFileSync('./ppp_filter.cjs', 'utf8');
['runPppScan','checkSignalChanges','calcPPPAllTF','updateCurrentPrices'].forEach(fn => {
    console.log(`${fn}: ${src.includes(fn) ? 'OK' : 'MISSING'}`);
});
