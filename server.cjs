const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const { calculateSignals } = require('./analyzer.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

// Telegram Alert Setup
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
// 콤마(,)로 구분하여 여러 명의 챗 아이디 입력 가능. 단체방/채널은 음수(-) 아이디를 사용해야 합니다.
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(id => id);
const alertCache = new Map(); // Prevent telegram spam

async function sendTelegramAlert(signal, stockName) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return;
    
    const cacheKey = `${signal.code}_${signal.timeframe}`;
    const lastSent = alertCache.get(cacheKey);
    // Cooldown: 4 hours per ticker/timeframe to prevent spam
    if (lastSent && (Date.now() - lastSent < 4 * 60 * 60 * 1000)) return;
    
    alertCache.set(cacheKey, Date.now());

    const priceText = signal.entry_price > 0 
        ? `${Math.round(signal.entry_price).toLocaleString()}원 부근` 
        : `${Math.round(signal.result_2).toLocaleString()}원 부근 (RSI 최저점)`;
        
    const text = `🚨 [매수 추천 승인] ${stockName} (${signal.code})\n` +
                 `- 성향: ${signal.category}\n` +
                 `- 권장 진입가: ${priceText}\n` +
                 `- 타임프레임: ${signal.timeframe}\n` +
                 `- 차트링크: https://www.tradingview.com/chart/?symbol=KRX:${signal.code}`;
                 
    for (const chatId of TELEGRAM_CHAT_IDS) {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, { chat_id: chatId, text: text }, {
                httpsAgent: new https.Agent({ family: 4 })
            });
        } catch (e) {
            console.error(`[Telegram] Failed to send alert to ${chatId}:`, e.message || String(e), e.response?.data || '');
        }
    }
    console.log(`[Telegram] Alert broadcasted for ${stockName} (${signal.code}) to ${TELEGRAM_CHAT_IDS.length} chats`);
}

// KIS API Setup
const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();
let kisAccessToken = null;
let kisTokenExpiry = 0;

async function getKisAccessToken() {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
        throw new Error("KIS API Keys are missing in .env");
    }

    // Reuse token if valid (buffer of 1 hour)
    if (kisAccessToken && kisTokenExpiry > Date.now() + 3600000) {
        return kisAccessToken;
    }

    console.log("[KIS API] Requesting new Access Token...");
    try {
        const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials',
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET
        });

        kisAccessToken = response.data.access_token;
        // Token expires in 86400 seconds (24 hours). Store expiry as timestamp.
        kisTokenExpiry = Date.now() + (response.data.expires_in * 1000);
        console.log(`[KIS API] Token successfully issued. Expires in ${response.data.expires_in}s`);
        
        return kisAccessToken;
    } catch (e) {
        console.error("[KIS API] Token Request Failed:", e.response?.data || e.message);
        throw new Error("Failed to get KIS Access Token");
    }
}

app.use(cors());
app.use(bodyParser.json());

const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initial stock master data
if (!fs.existsSync(STOCK_MASTER_FILE)) {
    // Basic setup, actual data is loaded dynamically
    fs.writeFileSync(STOCK_MASTER_FILE, JSON.stringify([], null, 2));
}

// Startup Archiving Logic
if (fs.existsSync(SIGNALS_FILE)) {
    try {
        const existingData = fs.readFileSync(SIGNALS_FILE, 'utf8');
        const signals = JSON.parse(existingData);
        if (signals.length > 0) {
            // Create a timestamped backup file
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                              (now.getMonth() + 1).toString().padStart(2, '0') +
                              now.getDate().toString().padStart(2, '0') + '_' +
                              now.getHours().toString().padStart(2, '0') +
                              now.getMinutes().toString().padStart(2, '0') +
                              now.getSeconds().toString().padStart(2, '0');
            const ARCHIVE_FILE = path.join(DATA_DIR, `signals_${timestamp}.json`);
            
            // Rename the file to archive it
            fs.renameSync(SIGNALS_FILE, ARCHIVE_FILE);
            console.log(`[Archive] Renamed past signals to ${ARCHIVE_FILE}`);
        }
    } catch (e) {
        console.error("Error reading or archiving signals file:", e);
    }
}

// ALWAYS create a fresh, empty signals.json after archiving or if missing
fs.writeFileSync(SIGNALS_FILE, JSON.stringify([], null, 2));
console.log(`[Init] Created fresh, empty signals.json for a new session.`);


// Send Custom Report to Telegram
app.post('/api/send-report', async (req, res) => {
    const { reportText } = req.body;

    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
        return res.status(400).json({ error: 'Telegram is not configured on the server.' });
    }
    
    if (!reportText) {
        return res.status(400).json({ error: 'Report text is required.' });
    }

    let successCount = 0;
    
    for (const chatId of TELEGRAM_CHAT_IDS) {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            const response = await axios.post(url, { 
                chat_id: chatId, 
                text: reportText
            }, {
                httpsAgent: new https.Agent({ family: 4 })
            });
            if (response.status === 200) {
                successCount++;
            } else {
                console.error(`[Telegram] HTTP Error ${response.status}:`, response.data);
            }
        } catch (e) {
            console.error(`[Telegram] Failed to send report to ${chatId}:`, e.message || String(e), e.response?.data || '');
        }
    }

    if (successCount > 0) {
        res.json({ message: `Report sent to ${successCount} chat(s) successfully.` });
    } else {
        res.status(500).json({ error: 'Failed to send report to any chat.' });
    }
});

// Routes
app.get('/api/stocks', (req, res) => {
    const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE));
    res.json(stocks);
});

app.get('/api/signals', (req, res) => {
    const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE));
    res.json(signals);
});

// SSE Clients
let clients = [];

app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.push(res);

    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
});

const broadcastUpdate = () => {
    clients.forEach(client => client.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`));
};

// Webhook Receiver
app.post('/api/webhook', (req, res) => {
    const { code, result_2, result_3, cond_up7, DHH2, progress, signal_HH } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Stock code is required' });
    }

    const newSignal = {
        id: uuidv4(),
        code,
        timestamp: Date.now(),
        result_2: result_2 || 0,
        result_3: result_3 || 0,
        cond_up7: cond_up7 || false,
        DHH2: DHH2 || false,
        progress: progress || 0,
        signal_HH: signal_HH || false,
        trigger_rsi: req.body.trigger_rsi || false,
        trigger_vol: req.body.trigger_vol || false,
        entry_approved: req.body.entry_approved || false,
        category: req.body.category || '분석대기',
        entry_price: req.body.entry_price || 0,
        ema5: req.body.ema5 || 0,
        ema10: req.body.ema10 || 0,
        ema20: req.body.ema20 || 0,
        bb_upper: req.body.bb_upper || 0,
        current_price: req.body.current_price || 0,
        open_price: req.body.open_price || 0,
        prev_close: req.body.prev_close || 0,
        timeframe: req.body.timeframe || '1D' // Default to 1D
    };

    // Auto-calculate signal_HH if not provided, based on Pine logic
    if (signal_HH === undefined) {
        newSignal.signal_HH = newSignal.DHH2 && newSignal.progress > 0.3;
    }

    // Opening Range Filter (09:00 - 09:15)
    // Only apply to timeframes <= 1H
    if (['5M', '15M', '30M', '1H'].includes(newSignal.timeframe)) {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        // Assuming KST is local time of the server
        if (hours === 9 && minutes >= 0 && minutes <= 15) {
            console.log(`[Filter] Blocked signal for ${code} due to Opening Range (09:00-09:15)`);
            return res.status(200).json({ message: 'Signal blocked by Opening Range filter', dropped: true });
        }
    }

    const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE));
    signals.push(newSignal);
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2));

    console.log(`[PRD Signal] ${code}: DHH2=${newSignal.DHH2}, Progress=${newSignal.progress.toFixed(2)}, HH=${newSignal.signal_HH}`);
    
    // Telegram Alert Trigger
    if (newSignal.entry_approved) {
        let stockName = code;
        try {
            const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE));
            const found = stocks.find(s => s.code === code);
            if (found) stockName = found.name;
        } catch (e) {}
        
        // Asynchronously send alert so we don't block the webhook response
        sendTelegramAlert(newSignal, stockName).catch(err => console.error(err));
    }

    // Notify clients instantly
    broadcastUpdate();

    res.status(200).json({ message: 'PRD Signal recorded', signal: newSignal });
});

// CSV Batch Import
app.post('/api/import-csv', (req, res) => {
    const { csv, timeframe } = req.body;
    if (!csv) {
        return res.status(400).json({ error: 'CSV data is required' });
    }

    const targetTimeframe = timeframe || '1D';

    try {
        const lines = csv.trim().split('\n');
        if (lines.length < 2) {
            return res.status(400).json({ error: 'CSV file is empty or invalid header' });
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
        const rows = lines.slice(1);

        // Find column indices (Fuzzy matching)
        const findIdx = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));
        
        const idxIcon = findIdx(['ticker', '종목코드', 'symbol']);
        const idxRSI2 = findIdx(['rsi2', 'rsi(2)', '결과2', 'result_2']);
        const idxRSI8 = findIdx(['rsi8', 'rsi(8)', '결과3', 'result_3']);
        const idxTrend = findIdx(['trend', 'cond_up7', '상승', '추세']);
        const idxDHH2 = findIdx(['dhh2', '수', '신호', '눌림']);
        const idxProg = findIdx(['prog', '진행', 'candle_progress']);

        if (idxIcon === -1) {
            return res.status(400).json({ error: '종목코드(Ticker) 컬럼을 찾을 수 없습니다.' });
        }

        const newSignals = rows.map(row => {
            const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
            const ticker = cols[idxIcon];
            if (!ticker) return null;

            // Extract numeric or boolean values
            const getVal = (idx, def) => (idx !== -1 && cols[idx]) ? (isNaN(cols[idx]) ? cols[idx] : parseFloat(cols[idx])) : def;
            
            const signal = {
                id: uuidv4(),
                code: ticker.split(':').pop(), // Remove 'KRX:' prefix if exists
                timestamp: Date.now(),
                result_2: getVal(idxRSI2, 50),
                result_3: getVal(idxRSI8, 50),
                cond_up7: getVal(idxTrend, true) === '상승' || getVal(idxTrend, true) === true || getVal(idxTrend, "") == "1",
                DHH2: getVal(idxDHH2, true) === '수' || getVal(idxDHH2, true) === true || getVal(idxDHH2, "") == "1" || findIdx(['수']) !== -1, // If column exists, assume true for batch
                progress: getVal(idxProg, 1.0),
                signal_HH: true, // In batch mode, we assume user is importing confirmed signals
                trigger_rsi: false,
                trigger_vol: false,
                entry_approved: false,
                category: '수동입력(분석대기)',
                entry_price: 0,
                timeframe: targetTimeframe,
                adx: 30, // Default passing value for manual imports
                isTrending: true
            };

            return signal;
        }).filter(s => s !== null);

        if (newSignals.length === 0) {
            return res.status(400).json({ error: '유효한 종목 데이터가 없습니다.' });
        }

        const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE));
        const merged = [...signals, ...newSignals];
        fs.writeFileSync(SIGNALS_FILE, JSON.stringify(merged, null, 2));

        console.log(`[Batch Import] ${newSignals.length} signals imported via CSV.`);
        broadcastUpdate();

        res.status(200).json({ message: `${newSignals.length}개의 종목이 성공적으로 불러와졌습니다.`, count: newSignals.length });
    } catch (error) {
        console.error("CSV Import Error:", error);
        res.status(500).json({ error: 'CSV 분석 중 오류가 발생했습니다.' });
    }
});

// Reset all tracking data
app.post('/api/reset', (req, res) => {
    try {
        fs.writeFileSync(SIGNALS_FILE, JSON.stringify([], null, 2));
        alertCache.clear();
        res.json({ message: '모든 분석 데이터가 초기화되었습니다.' });
    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ error: '초기화 중 오류가 발생했습니다.' });
    }
});

// Auto-Sync with Yahoo Finance
app.post('/api/auto-sync', async (req, res) => {
    const { timeframe } = req.body;
    const tf = timeframe || '1D';
    
    // Map internal timeframe to Yahoo Finance interval
    // 1H -> 1h, 2H -> 1h, 4H -> 1h (4h not directly supported easily, will use 1h), 1D -> 1d, 1W -> 1wk
    const intervalMap = { '5M': '5m', '15M': '15m', '30M': '30m', '1H': '1h', '2H': '1h', '4H': '1h', '1D': '1d', '1W': '1wk' };
    const interval = intervalMap[tf] || '1d';

    const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE));
    let syncResults = [];
    let errorCount = 0;

    console.log(`[Auto-Sync] Starting sync for ${stocks.length} stocks at ${tf} timeframe...`);

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    let kisTokenGlobal = null;
    try {
        kisTokenGlobal = await getKisAccessToken();
    } catch(e) {
        console.error("[Auto-Sync] KIS Token failed, falling back to pure Yahoo.");
    }

    // Helper to fetch Hybrid Data (Yahoo history + KIS real-time current price)
    const fetchHybridHistory = async (stock) => {
        let days = 60;
        if (tf === '1D') days = 365;
        if (tf === '1W') days = 1000;

        const suffix = stock.market.includes('KOSPI') ? '.KS' : '.KQ';
        const symbolKS = stock.code + suffix;

        const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
        const period2 = Math.floor(Date.now() / 1000);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolKS}?period1=${period1}&period2=${period2}&interval=${interval}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        if (!response.ok) throw new Error(`Yahoo Fetch Failed: ${response.status}`);
        const data = await response.json();
        const result = data.chart.result[0];
        const quotes = result.indicators.quote[0];
        const timestamps = result.timestamp;
        
        let validIndices = [];
        for (let i = 0; i < quotes.close.length; i++) {
            if (quotes.close[i] !== null && timestamps[i] !== null) {
                validIndices.push(i);
            }
        }

        let chartData = {
            open: validIndices.map(i => quotes.open[i]),
            high: validIndices.map(i => quotes.high[i]),
            low: validIndices.map(i => quotes.low[i]),
            close: validIndices.map(i => quotes.close[i]),
            volume: validIndices.map(i => quotes.volume[i]),
            time: validIndices.map(i => timestamps[i])
        };

        // KIS Real-Time Overlay
        if (kisTokenGlobal) {
            try {
                const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
                const kisRes = await axios.get(kisUrl, {
                    headers: {
                        'authorization': 'Bearer ' + kisTokenGlobal,
                        'appkey': KIS_APP_KEY,
                        'appsecret': KIS_APP_SECRET,
                        'tr_id': 'FHKST01010100'
                    },
                    params: {
                        "FID_COND_MRKT_DIV_CODE": "J",
                        "FID_INPUT_ISCD": stock.code
                    }
                });
                const kisData = kisRes.data.output;
                const currentPrice = parseInt(kisData.stck_prpr);
                const currentHigh = parseInt(kisData.stck_hgpr);
                const currentLow = parseInt(kisData.stck_lwpr);
                const currentOpen = parseInt(kisData.stck_oprc);
                const currentVolume = parseInt(kisData.acml_vol);
                
                chartData.kis_change_data = {
                    sign: kisData.prdy_vrss_sign,
                    change: parseInt(kisData.prdy_vrss),
                    rate: parseFloat(kisData.prdy_ctrt)
                };

                const lastIdx = chartData.close.length - 1;
                if (lastIdx >= 0 && currentPrice) {
                    if (tf === '1D') {
                        const lastDate = new Date(chartData.time[lastIdx] * 1000);
                        const isToday = lastDate.toDateString() === new Date().toDateString();
                        
                        if (isToday) {
                            chartData.open[lastIdx] = currentOpen;
                            chartData.high[lastIdx] = Math.max(chartData.high[lastIdx], currentHigh);
                            chartData.low[lastIdx] = Math.min(chartData.low[lastIdx], currentLow);
                            chartData.close[lastIdx] = currentPrice;
                            chartData.volume[lastIdx] = currentVolume;
                        } else {
                            // Yahoo is a day behind; push today's KIS data as a new candle
                            chartData.open.push(currentOpen);
                            chartData.high.push(currentHigh);
                            chartData.low.push(currentLow);
                            chartData.close.push(currentPrice);
                            chartData.volume.push(currentVolume);
                            chartData.time.push(Math.floor(Date.now() / 1000));
                        }
                    } else {
                        // For Intraday & Weekly, appending Daily open/vol corrupts the candle!
                        // Only safely extend the current developing candle's price reach.
                        chartData.close[lastIdx] = currentPrice;
                        chartData.high[lastIdx] = Math.max(chartData.high[lastIdx], currentPrice);
                        chartData.low[lastIdx] = Math.min(chartData.low[lastIdx], currentPrice);
                    }
                }
            } catch(e) {
                // If it fails, silent fallback to yahoo's tail
            }
        }

        return chartData;
    };

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);
        const tasks = batch.map(async (stock) => {
            try {
                const history = await fetchHybridHistory(stock);
                if (history && history.close && history.close.length > 50) {
                    const signal = calculateSignals(history, tf);
                    if (signal) {
                        return { ...signal, code: stock.code, name: stock.name, timeframe: tf, timestamp: Date.now(), id: uuidv4() };
                    }
                }
            } catch (e) {
                console.error(`[Auto-Sync] Error for ${stock.code} (${stock.name}):`, e.message);
                errorCount++;
            }
            return null;
        });

        const results = await Promise.all(tasks);
        syncResults.push(...results.filter(r => r !== null));
        
        // Progress update every few batches
        if (i > 0 && i % 50 === 0) {
            console.log(`[Auto-Sync] Processed ${i}/${stocks.length} stocks...`);
        }
        await sleep(100); // Small delay to prevent rate limits
    }

    if (syncResults.length > 0) {
        let currentSignals = JSON.parse(fs.readFileSync(SIGNALS_FILE));
        
        // Remove old signals for the matching code and timeframe
        const syncCodes = new Set(syncResults.map(s => s.code));
        currentSignals = currentSignals.filter(s => !(syncCodes.has(s.code) && s.timeframe === tf));

        const merged = [...currentSignals, ...syncResults];
        fs.writeFileSync(SIGNALS_FILE, JSON.stringify(merged, null, 2));
        broadcastUpdate();
    }

    console.log(`[Auto-Sync] Completed. Success: ${syncResults.length}, Errors: ${errorCount}`);
    res.json({ 
        message: `${syncResults.length}개 종목 동기화 성공 (${errorCount}개 실패)`, 
        count: syncResults.length 
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
