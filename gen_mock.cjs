const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function create() {
    try {
        const naverUrl = `https://m.stock.naver.com/api/stock/005930/integration`;
        const naverRes = await axios.get(naverUrl);
        const curPriceStr = naverRes.data.closePrice.replace(/,/g, '');
        const curPrice = parseInt(curPriceStr);

        const mockRec = [
            {
                code: "005930",
                name: "[테스트] 삼성전자",
                category: "강력 추천가 근접 테스트",
                rec_price: curPrice, // Exact match
                date: "2026-03-24" // Future date
            }
        ];

        const file = path.join(__dirname, 'data', 'past_recommendations.json');
        fs.writeFileSync(file, JSON.stringify(mockRec, null, 2), 'utf8');
        console.log("Wrote mock to: " + file);
        console.log("Price is: " + curPrice);
    } catch(e) { console.error(e); }
}

create();
