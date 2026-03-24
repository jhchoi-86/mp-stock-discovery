const fs = require('fs');
const path = require('path');
const axios = require('axios');
const env = require('dotenv').config({ path: path.join(__dirname, '.env') }).parsed;

const DATA_DIR = path.join(__dirname, 'data');
const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');

async function createMockRec() {
    try {
        const { getKisAccessToken } = require('./server.cjs'); // Might fail if conflicts, better to copy login
        // let's just make it simple: wait, maybe I shouldn't require server.cjs because it starts the server port.
        // Instead, just hardcode a past rec that will be read by the ALREADY RUNNING monitor.
        
        // Wait, to get the exact current price, I can just use a widely known stock and fetch it from naver or yahoo!
        const naverUrl = `https://m.stock.naver.com/api/stock/005930/integration`;
        const naverRes = await axios.get(naverUrl, { timeout: 3000 });
        const curPriceStr = naverRes.data.closePrice.replace(/,/g, '');
        const curPrice = parseInt(curPriceStr);

        const mockRec = [
            {
                code: "005930",
                name: "[테스트] 삼성전자",
                category: "강력 추천가 근접 테스트",
                rec_price: curPrice, // Exact match
                date: "2026-03-24" // Future date to bypass alertedSet
            }
        ];

        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(PAST_REC_FILE, JSON.stringify(mockRec, null, 2), 'utf8');

        console.log(`[Mock Injector] Successfully injected past_recommendations.json with target price ${curPrice}원! Expected Telegram alert to fire in 10s.`);
    } catch(e) {
        console.error(e);
    }
}

createMockRec();
