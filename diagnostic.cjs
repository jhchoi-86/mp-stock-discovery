const fs = require('fs');
const path = require('path');
const axios = require('axios');
const env = require('dotenv').config({ path: path.join(__dirname, '.env') }).parsed;

const DATA_DIR = path.join(__dirname, 'data');
const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');

async function getKisToken() {
    return "MOCK_TOKEN"; // Handled by actual API
}

async function runTest() {
    console.log("1. Checking time logic...");
    const now = new Date();
    const kstTemp = new Date(now.getTime() + 9 * 3600 * 1000);
    const day = kstTemp.getUTCDay();
    const hours = kstTemp.getUTCHours();
    const minutes = kstTemp.getUTCMinutes();
    console.log(`Day: ${day}, Hours: ${hours}, Mins: ${minutes}`);
    
    if (day === 0 || day === 6) { console.log("Weekend!"); return; }
    
    const timeNum = hours * 100 + minutes;
    if (timeNum < 859 || timeNum > 1530) { console.log("Out of hours! " + timeNum); return; }

    console.log("2. Checking file:", PAST_REC_FILE);
    if (!fs.existsSync(PAST_REC_FILE)) { console.log("File not found"); return; }
    const pastRecs = JSON.parse(fs.readFileSync(PAST_REC_FILE, 'utf8'));
    console.log("Loaded " + pastRecs.length + " recs.");

    // Direct fetch
    try {
        const naverUrl = `https://m.stock.naver.com/api/stock/005930/integration`;
        const naverRes = await axios.get(naverUrl);
        const curPriceStr = naverRes.data.closePrice.replace(/,/g, '');
        const currentPrice = parseInt(curPriceStr);
        console.log("3. Current Samsung price (Naver):", currentPrice);
        
        for (const rec of pastRecs) {
            const diffPerc = Math.abs(currentPrice - rec.rec_price) / rec.rec_price;
            if (diffPerc <= 0.001) {
                console.log(`TRIGGER: rec_price ${rec.rec_price} diff ${diffPerc}`);
            } else {
                // console.log(`SKIP: rec_price ${rec.rec_price} diff ${diffPerc}`);
            }
        }
    } catch(e) {
        console.error("Fetch error:", e.message);
    }
}
runTest();
