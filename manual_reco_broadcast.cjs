const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configs
const DATA_DIR = path.join(__dirname, 'data');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');

// Hardcoded for final manual broadcast (from server .env)
const TELEGRAM_BOT_TOKEN = "8629426971:AAGTzFaw9TqcF4V2PWY9dKCcX9tUIELzuM4";
const TELEGRAM_CHAT_IDS = ["6741237663","-1003821536889"];

async function runManualBroadcast() {
    console.log('[Manual-Broadcast] Starting Report Generation...');
    try {
        if (!fs.existsSync(SIGNALS_FILE)) throw new Error('SIGNALS_FILE missing');
        if (!fs.existsSync(STOCK_MASTER_FILE)) throw new Error('STOCK_MASTER_FILE missing');

        const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));

        const getSignalsForStock = (code) => {
            const stockSignals = signals.filter(s => s.code === code);
            const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];
            const status = {};
            timeframes.forEach(tf => {
                const latest = stockSignals.filter(s => s.timeframe === tf).sort((a, b) => b.timestamp - a.timestamp)[0];
                status[tf] = latest;
            });
            return status;
        };

        const getLatestGlobal = (code) => signals.filter(s => s.code === code).sort((a, b) => b.timestamp - a.timestamp)[0];

        let candidates = stocks.map(stock => {
            const tfSigs = getSignalsForStock(stock.code);
            const latest = getLatestGlobal(stock.code);
            let score = 0;              
            let coreScore = 0;
            const tfs = ['2H', '1D', '1W'];
            tfs.forEach(tf => {
                let tfScore = 0;
                if (tfSigs[tf] && tfSigs[tf].cond_up7) tfScore += 25;
                if (tfSigs[tf] && (tfSigs[tf].signal_HH || tfSigs[tf].DHH2)) tfScore += 25;
                if (tfScore > coreScore) coreScore = tfScore; 
            });
            score += coreScore;
            if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
            if (tfSigs['1W'] && tfSigs['1W'].trigger_vol) score += 5;
            let bestDistScore = 0;
            const curPrice = latest?.current_price || latest?.entry_price || 0;
            if (curPrice > 0) {
                tfs.forEach(tf => {
                    if (tfSigs[tf] && tfSigs[tf].result_2) {
                        const diffPct = ((curPrice - tfSigs[tf].result_2) / tfSigs[tf].result_2) * 100;
                        if (diffPct >= 0 && diffPct <= 0.5) bestDistScore = Math.max(bestDistScore, 6);
                        else if (diffPct > 0.5 && diffPct <= 1.0) bestDistScore = Math.max(bestDistScore, 4);
                    }
                });
            }
            score += bestDistScore;
            if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) score += 10;
            if (tfSigs['1D'] && (tfSigs['1D'].signal_HH || tfSigs['1D'].DHH2)) score += 10;
            if (tfSigs['1W'] && (tfSigs['1W'].signal_HH || tfSigs['1W'].DHH2)) score += 10;
            const bonus = latest?.kis_change_data?.bonus_score || 0;
            score += bonus;
            return { ...stock, timeframeStatus: tfSigs, latestSignal: latest, total_score: Math.min(score, 100) };
        }).filter(s => s.latestSignal);

        candidates = candidates.sort((a, b) => b.total_score - a.total_score);
        const approvedStocks = candidates.slice(0, 10);

        if (approvedStocks.length === 0) {
            console.log('[Manual-Broadcast] No candidates found.');
            return;
        }

        let header = `📈 MP 내일 추천 종목 리서치 (수동발송 - Top 10)\n`;
        header += `생성 일시: ${new Date().toLocaleString()}\n`;
        header += `분석 종목 수: ${candidates.length}개\n\n`;
        header += `🔥 [추천 종목 감시 명단]\n`;

        let body = "";
        approvedStocks.forEach((s, idx) => {
            const tfSigs = s.timeframeStatus || {};
            const sig2H = tfSigs['2H'];
            const curPrice = s.latestSignal?.current_price || s.latestSignal?.entry_price || 0;
            const score = s.total_score || 0;
            const stars = '★'.repeat(Math.max(0, Math.min(5, Math.round(score / 20)))) + '☆'.repeat(Math.max(0, Math.min(5, 5 - Math.round(score / 20))));
            
            let priceText = "-";
            if (sig2H && sig2H.ema5 > 0) {
                priceText = `현재가: ${Math.round(curPrice).toLocaleString()}원\n` +
                            `1차 매수타점: ${Math.round(sig2H.result_2).toLocaleString()}원\n` +
                            `1차목표가(2H): ${Math.round(sig2H.bb_upper).toLocaleString()}원`;
            } else {
                priceText = `${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2 || 0).toLocaleString()}원`;
            }
            
            body += `🔹 ${idx+1}. ${s.name} (${s.code})\n`;
            body += `분류: ${s.latestSignal.category} | 총점: ${stars} (${score}점)\n`;
            body += `${priceText}\n\n`;
        });

        const footer = `---\n* 본 리포트는 관리자 요청에 의해 수동으로 생성되었습니다.`;
        const fullContent = header + body + footer;

        for (const chatId of TELEGRAM_CHAT_IDS) {
            console.log(`[Manual-Broadcast] Sending to ${chatId} (length: ${fullContent.length})...`);
            try {
                const res = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { 
                    chat_id: chatId, 
                    text: fullContent,
                    parse_mode: 'HTML' // Try HTML to see if there's a character escaping issue
                });
                console.log(`[Manual-Broadcast] Success for ${chatId}`);
            } catch (e) { 
                console.error(`[Manual-Broadcast] Fail for ${chatId}:`, e.response?.data || e.message); 
                // Fallback: Send without HTML
                try {
                   await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { 
                        chat_id: chatId, 
                        text: fullContent
                    });
                    console.log(`[Manual-Broadcast] Success (No-HTML Fallback) for ${chatId}`);
                } catch(e2) {
                    console.error(`[Manual-Broadcast] Final Fail for ${chatId}:`, e2.response?.data || e2.message);
                }
            }
        }
        console.log('[Manual-Broadcast] Process Complete.');
    } catch (e) {
        console.error('[Manual-Broadcast Error]', e.message);
    }
}

runManualBroadcast();
