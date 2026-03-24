const fs = require('fs');

async function summarize() {
    try {
        const data = JSON.parse(fs.readFileSync('./data/live_signals.json', 'utf8'));
        const counts = { '5M':0, '15M':0, '30M':0, '1H':0, '2H':0, '4H':0, '1D':0, '1W':0 };
        const examples = { '5M':[], '15M':[], '30M':[], '1H':[], '2H':[], '4H':[], '1D':[], '1W':[] };

        data.forEach(item => {
            const tf = item.timeframe;
            if (tf && item.DHH2) {
                if(counts[tf] !== undefined) counts[tf]++;
                if(examples[tf] && examples[tf].length < 15) {
                    examples[tf].push(item.name || item.code || 'Unknown');
                }
            }
        });

        console.log('\n===== DHH2 (강한 눌림목) 전종목/전시간대 감지 요약 =====');
        let total = 0;
        Object.keys(counts).forEach(tf => {
            total += counts[tf];
            if (counts[tf] > 0) {
                console.log(`[${tf}] ${counts[tf]}건 감지 -> 예시: ${examples[tf].join(', ')}`);
            } else {
                console.log(`[${tf}] 0건 감지`);
            }
        });
        console.log(`\n=> 총합계: 전시간대 누적 ${total}건 감지 완료`);
        console.log('====================================================\n');
    } catch (e) {
        console.error("Error reading live_signals.json:", e);
    }
}
summarize();
