const fs = require('fs');

const stocks = [
  { name: 'DL이앤씨', code: '375500.KS', t1: 65993, t2: 67100 },
  { name: 'GS건설', code: '006360.KS', t1: 31236, t2: 30800 },
  { name: '덕산네오룩스', code: '213420.KQ', t1: 48931, t2: 46300 },
  { name: '한전KPS', code: '051600.KS', t1: 64876, t2: 64400 },
  { name: '대주전자재료', code: '078600.KQ', t1: 124605, t2: 124000 },
  { name: '삼천당제약', code: '000250.KQ', t1: 918475, t2: 931000 },
  { name: 'DL', code: '000210.KS', t1: 61817, t2: 62000 },
  { name: 'ISC', code: '095340.KQ', t1: 244898, t2: 235000 },
  { name: '성광벤드', code: '014620.KQ', t1: 37027, t2: 35150 },
  { name: '두산테스나', code: '131970.KQ', t1: 102621, t2: 103400 },
];

async function run() {
    let md = '# 📈 VIP 리포트 가상 성과율 분석 (2026.03.23. 오후 12:37 기준)\n\n';
    md += '본 문서는 2026.03.23. 오후 12:37에 발행된 VIP 추천 종목 10개의 **돌파 매수타점** 및 **1차 매수타점**에 진입했을 경우, 현재 종가(현재가) 기준으로 얼마의 성과율(%)이 발생했는지를 계산한 결과입니다.\n\n';
    md += '| 순위 | 종목명 | 현재 종가 | 돌파 매수타점 | 돌파 타점 성과율 | 1차 매수타점 | 1차 타점 성과율 |\n';
    md += '|------|--------|----------|---------------|----------------|--------------|----------------|\n';
    
    let totalRoi1 = 0;
    let totalRoi2 = 0;

    for (let i = 0; i < stocks.length; i++) {
        const s = stocks[i];
        let currentPrice = 0;
        try {
            const res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${s.code}?interval=1d`);
            const json = await res.json();
            currentPrice = json.chart.result[0].meta.regularMarketPrice;
        } catch(e) {
            console.log('Error fetching', s.code, e.message);
            currentPrice = 0;
        }

        if (currentPrice > 0) {
            const roi1 = ((currentPrice - s.t1) / s.t1) * 100;
            const roi2 = ((currentPrice - s.t2) / s.t2) * 100;
            
            totalRoi1 += roi1;
            totalRoi2 += roi2;

            const formatNum = (num) => num.toLocaleString('ko-KR') + '원';
            const formatRoi = (roi) => {
                const prefix = roi > 0 ? '+' : '';
                return `**${prefix}${roi.toFixed(2)}%**`;
            };

            md += `| ${i+1} | **${s.name}** | ${formatNum(currentPrice)} | ${formatNum(s.t1)} | ${formatRoi(roi1)} | ${formatNum(s.t2)} | ${formatRoi(roi2)} |\n`;
        }
    }
    
    md += `| **계** | **종합 평균** | - | - | **${(totalRoi1 / stocks.length).toFixed(2)}%** | - | **${(totalRoi2 / stocks.length).toFixed(2)}%** |\n\n`;
    md += '> *※ 야후 파이낸스 실시간(혹은 종가) 데이터를 기준으로 즉석에서 계산된 결과입니다.*\n';
    
    fs.writeFileSync('C:\\Users\\danbe\\.gemini\\antigravity\\brain\\2f377368-394d-4145-a69b-947fd8008d76\\vip_roi_analysis.md', md, 'utf8');
    console.log('Document created!');
}
run();
