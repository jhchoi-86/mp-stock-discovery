require('dotenv').config();
const axios = require('axios');
const https = require('https');

const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELE_IDS = process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID.split(',').map(s=>s.trim()).filter(s=>s) : [];

console.log("Token:", TELE_TOKEN ? "EXISTS" : "MISSING");
console.log("IDs:", TELE_IDS);

async function run() {
    for (const chatId of TELE_IDS) {
        try {
            const url = `https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`;
            const msg = `🚨 [단타/스윙 텔레그램 진단]\n\nNightly Monitor 텔레그램 발송 환경변수 테스트 메시지입니다.`;
            const res = await axios.post(url, { chat_id: chatId, text: msg }, { httpsAgent: new https.Agent({ family: 4 }) });
            console.log(`Success to ${chatId}:`, res.data.ok);
        } catch(e) {
            console.error(`Error to ${chatId}:`, e.message, e.response?.data);
        }
    }
}
run();
