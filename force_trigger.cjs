const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function testReport() {
    console.log('[Test] Triggering manual Daily Performance Report...');
    try {
        const reportPath = path.join(__dirname, 'data/vip_logs/latest.json');
        if (!fs.existsSync(reportPath)) {
            console.error('Report file not found:', reportPath);
            return;
        }
        
        const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const { stocks, summary, header } = data;
        
        let content = `🔥 [Daily 성과 리포트] (${header.report_date || '3. 25.'})\n\n`;
        
        if (stocks && stocks.length > 0) {
            stocks.forEach((s, idx) => {
                const statusIcon = s.status === '체결' ? '✅' : '⏳';
                const yieldSign = s.yield_pct > 0 ? '+' : '';
                content += `${idx + 1}. ${s.name} (${s.code})\n`;
                content += `- 상태: ${s.status} ${statusIcon}\n`;
                content += `- 수익률: ${yieldSign}${s.yield_pct}%\n`;
                content += `- 진입가: ${(s.target_price || 0).toLocaleString()}원\n`;
                content += `- 추천일: ${s.recommended_at || '3. 25.'}\n\n`;
            });
        }
        
        content += `📊 종합 요약\n`;
        content += `- 금일 적중률: ${summary.hit_rate || '0%'}\n`;
        content += `- 평균 수익률: ${summary.avg_yield || '0.0%'}\n\n`;
        content += `* [테스트 발송] 본 리포트는 장 마감 5분 후 자동 집계되었습니다.`;

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(id => id);

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length > 0) {
            for (const chatId of TELEGRAM_CHAT_IDS) {
                const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
                await axios.post(url, { chat_id: chatId, text: content }, { httpsAgent: new https.Agent({ family: 4 }) });
            }
            console.log('[Test] Report sent successfully to Telegram');
        } else {
            console.error('Telegram config missing');
        }
    } catch (e) {
        console.error('Test Error:', e.message);
    }
}

testReport();
