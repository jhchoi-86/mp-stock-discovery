const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

// Configs - Matches server.cjs
const DATA_DIR = path.join(__dirname, 'data');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID.split(',') : [];
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
const PORT = process.env.PORT || 3001;

// 🔴 [Match] server.cjs is now using the secret from .env
const CRON_SECRET = "mp_cron_secret_2026"; 

async function getKisAccessToken() {
    const url = 'https://openapi.koreainvestment.com:9443/oauth2/tokenP';
    const res = await axios.post(url, {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET
    });
    return res.data.access_token;
}

async function runManualProcess() {
    console.log('[Manual] Starting 1D, 2H Sync...');
    try {
        const localApi = `http://127.0.0.1:${PORT}/api/auto-sync`;
        const syncRes = await axios.post(localApi, { timeframes: ['1D', '2H'] }, {
            headers: { 'x-internal-cron-secret': CRON_SECRET }
        });
        console.log('[Manual] Sync Response:', syncRes.data);
        console.log('[Manual] Waiting 240s for background completion...');
        await new Promise(resolve => setTimeout(resolve, 240000));
        
        console.log('[Manual] Starting Recommendation Logic...');
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

        const kisToken = await getKisAccessToken();
        candidates = candidates.sort((a, b) => b.total_score - a.total_score);
        const approvedStocks = candidates.slice(0, 10);

        if (approvedStocks.length === 0) {
            console.log('[Manual] No candidates found.');
            return;
        }

        // DB Archiving
        const snapshotData = candidates.map(s => {
            const tfSigs = s.timeframeStatus || {};
            const latest = s.latestSignal || {};
            const kd = latest.kis_change_data || {};
            let tradeAmt = null;
            if (kd.trade_amount !== undefined) {
              try { tradeAmt = BigInt(kd.trade_amount); } catch(e) {}
            }
            return {
                code: s.code,
                name: s.name,
                category: latest.category || '분석대기',
                score: s.total_score || 0,
                adx: (typeof latest.adx === 'number') ? Math.round(latest.adx) : 0,
                trend: tfSigs['1D']?.cond_up7 ? "상승" : "관망",
                currentPrice: latest.current_price || 0,
                entryPrice1: tfSigs['1H']?.result_2 || 0,
                entryPrice2: tfSigs['2H']?.result_2 || 0,
                entryPrice3: tfSigs['4H']?.result_2 || 0,
                targetPrice1: tfSigs['1D']?.bb_upper || 0,
                tradeAmount: tradeAmt,
                foreignBuy: kd.foreign_buy || '-',
                instBuy: kd.inst_buy || '-',
                yield: (tfSigs['1H']?.result_2 > 0) ? parseFloat(((latest.current_price - tfSigs['1H'].result_2) / tfSigs['1H'].result_2 * 100).toFixed(2)) : 0
            };
        });

        if (snapshotData.length > 0) {
            await prisma.dailyStockSnapshot.createMany({ data: snapshotData, skipDuplicates: true });
            console.log(`[Manual] ${snapshotData.length} stocks archived.`);
        }

        let aiCommentsMap = {};
        try {
            const aiPayload = approvedStocks.map(s => ({
                symbol: s.code,
                name: s.name,
                category: s.latestSignal.category,
                price: s.latestSignal.current_price || s.latestSignal.entry_price || 0,
                indicators: {
                    adx: s.latestSignal.adx || 0,
                    score: s.total_score,
                    trend: s.timeframeStatus['1D']?.cond_up7 ? "상승" : "관망"
                }
            }));
            const aiRes = await axios.post('http://127.0.0.1:8000/api/v1/generate-comment', { stocks: aiPayload }, { timeout: 30000 });
            const commentsArray = Array.isArray(aiRes.data) ? aiRes.data : (aiRes.data.data || []);
            commentsArray.forEach(item => { if (item.symbol) aiCommentsMap[item.symbol] = item.ai_comment; });
        } catch (e) {
            console.error('[Manual AI Error]', e.message);
        }

        let content = `📈 MP 내일 추천 종목 리서치 (수동발송 - Top 10)\n`;
        content += `생성 일시: ${new Date().toLocaleString()}\n`;
        content += `분석 종목 수: ${candidates.length}개\n\n`;
        content += `🔥 [추천 종목 감시 명단]\n`;

        approvedStocks.forEach(s => {
            const tfSigs = s.timeframeStatus || {};
            const sig2H = tfSigs['2H'];
            const curPrice = s.latestSignal?.current_price || s.latestSignal?.entry_price || 0;
            const score = s.total_score || 0;
            const stars = '★'.repeat(Math.max(0, Math.min(5, Math.round(score / 20)))) + '☆'.repeat(Math.max(0, Math.min(5, 5 - Math.round(score / 20))));
            
            let priceText = "-";
            if (sig2H) {
                const stopLoss = sig2H.stop_loss || 0;
                priceText = `현재가: ${Math.round(curPrice).toLocaleString()}원\n` +
                            `1차 매수타점: ${Math.round(sig2H.result_2).toLocaleString()}원\n` +
                            `2차 매수타점: ${Math.round(sig2H.result_3).toLocaleString()}원\n` +
                            `손절가 (SL): ${stopLoss > 0 ? Math.round(stopLoss).toLocaleString() : Math.round(sig2H.result_3 * 0.98).toLocaleString()}원\n` +
                            `1차목표가(1D): ${Math.round(tfSigs['1D']?.bb_upper || sig2H.bb_upper).toLocaleString()}원`;
            } else {
                priceText = `${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2 || 0).toLocaleString()}원`;
            }
            
            content += `🔹 ${s.name} (${s.code})\n`;
            content += `분류: ${s.latestSignal.category} | 총점: ${stars} (${score}점)\n`;
            if (aiCommentsMap[s.code]) content += `💡 AI 코멘트: ${aiCommentsMap[s.code]}\n`;
            content += `${priceText}\n\n`;
        });

        content += `---\n* 본 리포트는 관리자 요청에 의해 수동으로 생성되었습니다.`;

        for (const chatId of TELEGRAM_CHAT_IDS) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: chatId, text: content });
            } catch (e) { console.error(`[Telegram] Fail:`, e.message); }
        }
        console.log('[Manual] Process Complete.');
    } catch (e) {
        console.error('[Manual Error]', e.response?.data || e.message);
    } finally {
        await prisma.$disconnect();
    }
}

runManualProcess();
