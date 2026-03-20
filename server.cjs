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
const cron = require('node-cron');
const { calculateSignals } = require('./analyzer.cjs');
const { savePastRecommendations, evaluatePastRecommendations, generateSummaryReport, EXCEL_FILE } = require('./src/utils/historyManager.cjs');

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
                 `- 차트링크: https://www.tradingview.com/chart/?symbol=KRX:${signal.code}\n\n` +
                 `⚠️ 본 알림은 시스템에 의한 단순 참고용이며, 투자 결과에 대한 모든 법적 책임은 투자자 본인에게 있습니다.`;
                 
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

const TOKEN_DIR = path.join(__dirname, 'data');
const KIS_TOKEN_FILE = path.join(TOKEN_DIR, 'kis_token.json');

async function getKisAccessToken() {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
        throw new Error("KIS API Keys are missing in .env");
    }

    // Load from file if not in memory
    if (!kisAccessToken && fs.existsSync(KIS_TOKEN_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(KIS_TOKEN_FILE, 'utf8'));
            kisAccessToken = saved.token;
            kisTokenExpiry = saved.expiry;
        } catch (e) {
            console.error("[KIS API] Failed to read token cache file:", e);
        }
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
        
        // Save to file to survive PM2 restarts
        if (!fs.existsSync(TOKEN_DIR)) {
            fs.mkdirSync(TOKEN_DIR);
        }
        fs.writeFileSync(KIS_TOKEN_FILE, JSON.stringify({
            token: kisAccessToken,
            expiry: kisTokenExpiry
        }));
        
        console.log(`[KIS API] Token successfully issued and cached. Expires in ${response.data.expires_in}s`);
        
        return kisAccessToken;
    } catch (e) {
        console.error("[KIS API] Token Request Failed:", e.response?.data || e.message);
        throw new Error("Failed to get KIS Access Token");
    }
}

const cookieParser = require('cookie-parser');
const authRouter = require('./src/routes/auth.cjs');
const adminRouter = require('./src/routes/admin.cjs');
const usersRouter = require('./src/routes/users.cjs');
const reportRouter = require('./src/routes/report.cjs');

// Trust proxies if behind AWS ELB/NGINX
app.set('trust proxy', 1);

const CLIENT_URL = process.env.CLIENT_URL || 'https://mpstock.co.kr';
app.use(cors({
  origin: [CLIENT_URL, 'https://mpstock.co.kr', 'https://www.mpstock.co.kr', 'http://localhost:5173'], // Allow client domains
  credentials: true
}));

app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/send-report', reportRouter);

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


// Routes
app.use('/api/reports', require('./src/routes/archive.cjs'));
app.use('/api/roi-ranking', require('./src/routes/roi.cjs'));
app.use('/api/subscriptions', require('./src/routes/subscriptions.cjs'));

// Routes
app.get('/api/download-history', (req, res) => {
    if (!fs.existsSync(EXCEL_FILE)) {
        return res.status(404).json({ error: '엑셀 파일이 아직 생성되지 않았습니다.' });
    }
    res.download(EXCEL_FILE, 'MP_추천성과_누적기록.xlsx');
});

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
        if (tf === '5M') days = 5;
        if (tf === '15M') days = 15;
        if (tf === '30M') days = 30;
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
                const tradeAmount = parseInt(kisData.acml_tr_pbmn);
                
                let foreignBuy = '-';
                let instBuy = '-';
                try {
                    const naverUrl = `https://m.stock.naver.com/api/stock/${stock.code}/integration`;
                    const naverRes = await axios.get(naverUrl, { timeout: 3000 });
                    if (naverRes.data && naverRes.data.dealTrendInfos && naverRes.data.dealTrendInfos.length > 0) {
                        const todayTrend = naverRes.data.dealTrendInfos[0];
                        foreignBuy = todayTrend.foreignerPureBuyQuant || '-';
                        instBuy = todayTrend.organPureBuyQuant || '-';
                    }
                } catch(e) {
                    // silently fallback if Naver API fails to keep sync running
                }

                chartData.kis_change_data = {
                    sign: kisData.prdy_vrss_sign,
                    change: parseInt(kisData.prdy_vrss),
                    rate: parseFloat(kisData.prdy_ctrt),
                    trade_amount: tradeAmount,
                    foreign_buy: foreignBuy,
                    inst_buy: instBuy
                };

                const lastIdx = chartData.close.length - 1;
                if (lastIdx >= 0 && currentPrice) {
                    if (tf === '1D') {
                        // Yahoo timestamps for KS/KQ are usually 00:00:00 UTC (9:00 AM KST)
                        // We need to compare dates in KST (+9 hours) to avoid UTC boundary issues on AWS
                        const getKSTDateString = (timestampMs) => {
                            const date = new Date(timestampMs);
                            // Add 9 hours for KST
                            date.setUTCHours(date.getUTCHours() + 9);
                            return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
                        };
                        
                        const lastCandleKST = getKSTDateString(chartData.time[lastIdx] * 1000);
                        const currentKST = getKSTDateString(Date.now());
                        const isToday = lastCandleKST === currentKST;
                        
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
                if (e.response && e.response.status === 429) {
                    console.error(`[KIS API Rate Limit] ${stock.code} fell back to Yahoo`);
                }
            }
        }

        if (tf === '2H') chartData = resampleChartData(chartData, 2);
        if (tf === '4H') chartData = resampleChartData(chartData, 4);

        return chartData;
    };

    const resampleChartData = (raw, hourCount) => {
        let resampled = { open: [], high: [], low: [], close: [], volume: [], time: [] };
        if (!raw.time || raw.time.length === 0) return resampled;

        let currentCandle = null;
        let candleCount = 0;
        let currentDayStr = null;

        for (let i = 0; i < raw.time.length; i++) {
            const date = new Date(raw.time[i] * 1000);
            date.setUTCHours(date.getUTCHours() + 9);
            const dayStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

            if (currentDayStr !== dayStr) {
                if (currentCandle) {
                    resampled.open.push(currentCandle.open);
                    resampled.high.push(currentCandle.high);
                    resampled.low.push(currentCandle.low);
                    resampled.close.push(currentCandle.close);
                    resampled.volume.push(currentCandle.volume);
                    resampled.time.push(currentCandle.time);
                }
                currentDayStr = dayStr;
                currentCandle = { open: raw.open[i], high: raw.high[i], low: raw.low[i], close: raw.close[i], volume: raw.volume[i], time: raw.time[i] };
                candleCount = 1;
            } else {
                if (candleCount === 0) {
                    currentCandle = { open: raw.open[i], high: raw.high[i], low: raw.low[i], close: raw.close[i], volume: raw.volume[i], time: raw.time[i] };
                    candleCount = 1;
                } else {
                    currentCandle.high = Math.max(currentCandle.high, raw.high[i]);
                    currentCandle.low = Math.min(currentCandle.low, raw.low[i]);
                    currentCandle.close = raw.close[i];
                    currentCandle.volume += raw.volume[i];
                    candleCount++;
                    
                    if (candleCount === hourCount) {
                        resampled.open.push(currentCandle.open);
                        resampled.high.push(currentCandle.high);
                        resampled.low.push(currentCandle.low);
                        resampled.close.push(currentCandle.close);
                        resampled.volume.push(currentCandle.volume);
                        resampled.time.push(currentCandle.time);
                        currentCandle = null;
                        candleCount = 0;
                    }
                }
            }
        }

        if (currentCandle) {
            resampled.open.push(currentCandle.open);
            resampled.high.push(currentCandle.high);
            resampled.low.push(currentCandle.low);
            resampled.close.push(currentCandle.close);
            resampled.volume.push(currentCandle.volume);
            resampled.time.push(currentCandle.time);
        }

        if (raw.kis_change_data) {
            resampled.kis_change_data = raw.kis_change_data;
        }

        return resampled;
    };

    // Process in batches to avoid rate limits (KIS API strict limit: 20 req/sec)
    // 2 per 200ms = 10 req/s, extremely safe margin to prevent silent data loss
    const BATCH_SIZE = 2;
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
        await sleep(200); // Increased delay to prevent KIS API 429 Too Many Requests
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
    // PM2 워커 준비 완료 신호 전송 (무중단 배포를 위한 listen_timeout 대기 해제)
    if (process.send) {
        process.send('ready');
        console.log(`[PM2] Sent 'ready' signal from worker ${process.env.NODE_APP_INSTANCE || 'unknown'}`);
    }
});

// --- [Background Tasks / Scheduler Guard] ---
// PM2 클러스터 모드(instances: 'max') 적용 시 코어 수만큼 백그라운드 스케줄러가
// 중복 실행되는 것을 방지하기 위해, 오직 0번 워커(Primary)에서만 동작하도록 제한합니다.
const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';
if (isPrimaryWorker) {
    console.log('[Scheduler] Primary worker initialized scheduling tasks.');
    cron.schedule('0 21 * * 1-5', async () => {
        console.log('[Cron] 자동 종목 발굴 및 텔레그램 발송 시작...');
        try {
            const localApi = `http://127.0.0.1:${PORT}/api/auto-sync`;
            console.log('[Cron] 1D 동기화 시작...');
            await axios.post(localApi, { timeframe: '1D' });
            console.log('[Cron] 2H 동기화 시작...');
            await axios.post(localApi, { timeframe: '2H' });

            const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
            const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));

            const getSignalsForStock = (code) => {
              const stockSignals = signals.filter(s => s.code === code);
              const timeframes = ["1H", "2H", "4H", "1D", "1W"];
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
              if (tfSigs['2H'] && tfSigs['2H'].cond_up7) score += 25;
              if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) score += 25;
              if (latest && latest.trigger_vol) score += 10;

              const targetData = (tfSigs['2H'] && tfSigs['2H'].ema5 > 0) ? tfSigs['2H'] : (tfSigs['1D'] && tfSigs['1D'].ema5 > 0 ? tfSigs['1D'] : latest);
              if (targetData && targetData.ema5 > 0 && targetData.result_2 > 0) {
                const diffPercent = Math.abs(targetData.ema5 - targetData.result_2) / targetData.result_2 * 100;
                if (diffPercent <= 0.5) score += 40;
                else if (diffPercent <= 1.0) score += 25;
              }

              return { ...stock, timeframeStatus: tfSigs, latestSignal: latest, total_score: Math.min(score, 100) };
            }).filter(s => s.latestSignal);

            candidates = candidates.filter(stock => {
              const tfSigs = stock.timeframeStatus || {};
              const hasSuSignal = Object.values(tfSigs).some(s => s && (s.signal_HH || s.DHH2));
              const hasHighAdx = stock.latestSignal && stock.latestSignal.adx >= 30;
              const isUpwardTrend = tfSigs['1D'] && tfSigs['1D'].cond_up7;
              const isExcludedCategory = stock.latestSignal && (stock.latestSignal.category === "하락 추세" || stock.latestSignal.category === "바닥권 반등");
              if (stock.latestSignal?.entry_approved) return true;
              return (hasSuSignal && hasHighAdx && isUpwardTrend && !isExcludedCategory);
            }).sort((a, b) => b.total_score - a.total_score);

            if (candidates.length === 0) {
              console.log('[Cron] 조건에 맞는 종목이 없어 발송하지 않습니다.');
              return;
            }

            const approvedStocks = candidates.filter(s => s.latestSignal && s.latestSignal.entry_approved);

            const kisToken = await getKisAccessToken();
            const reviewText = await evaluatePastRecommendations(kisToken, KIS_APP_KEY, KIS_APP_SECRET);

            const now = new Date();
            now.setUTCHours(now.getUTCHours() + 9);
            const isFriday = now.getDay() === 5;
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            const isEndOfMonth = tomorrow.getMonth() !== now.getMonth();

            let weeklyText = null;
            let monthlyText = null;

            if (isFriday) weeklyText = await generateSummaryReport('weekly');
            if (isEndOfMonth) monthlyText = await generateSummaryReport('monthly');

            let content = `📈 야간 MP 종목 발굴 리포트 (자동)\n`;
            content += `생성 일시: ${new Date().toLocaleString()}\n`;
            if (reviewText) content += reviewText;
            if (weeklyText) content += weeklyText;
            if (monthlyText) content += monthlyText;
            content += `분석 종목 수: ${candidates.length}개\n\n`;

            if (approvedStocks.length > 0) {
              content += `🔥 [강력 추천] 매수 진입 승인 종목\n`;
              approvedStocks.forEach(s => {
                const tfSigs = s.timeframeStatus || {};
                const sig2H = tfSigs['2H'];
                let priceText = "-";
                if (sig2H && sig2H.ema5 > 0) {
                  priceText = `급등1차/눌림1차/눌림2차: ${Math.round(sig2H.ema5).toLocaleString()}원 / ${Math.round(sig2H.result_2).toLocaleString()}원 / ${Math.round(sig2H.result_3).toLocaleString()}원\n1차목표가: ${Math.round(sig2H.bb_upper).toLocaleString()}원`;
                } else {
                  priceText = `${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2).toLocaleString()}원`;
                }
                content += `🔹 ${s.name} (${s.code})\n분류: ${s.latestSignal.category}\n${priceText}\n차트: https://kr.tradingview.com/chart/?symbol=KRX:${s.code}\n\n`;
              });
              content += `---\n\n`;
            }

            content += `📋 주요 모니터링 리스트 (총합 점수순)\n\n`;
            content += candidates.slice(0, 15).map(stock => {
              const tfSigs = stock.timeframeStatus || {};
              const getStat = tf => tfSigs[tf] ? (tfSigs[tf].signal_HH ? "수(HH)" : (tfSigs[tf].DHH2 ? "수" : "-")) : "-";
              const trend = tfSigs['1D']?.cond_up7 ? "상승" : "-";
              const sig2H = tfSigs['2H'];
              let priceText = "-";
              if (sig2H && sig2H.ema5 > 0) {
                 priceText = `급등1차/눌림1차/눌림2차: ${Math.round(sig2H.ema5).toLocaleString()}원 / ${Math.round(sig2H.result_2).toLocaleString()}원 / ${Math.round(sig2H.result_3).toLocaleString()}원\n1차목표가: ${Math.round(sig2H.bb_upper).toLocaleString()}원`;
              }
              const adx = stock.latestSignal ? Math.round(stock.latestSignal.adx) : "-";
              return `🔹 ${stock.name} (${stock.code}) | 점수: ${stock.total_score}\n` +
                     `분류: ${stock.latestSignal.category}\n` +
                     `세력강도: ${adx} | 1D:${getStat('1D')} | 1W:${getStat('1W')} | 추세:${trend}\n` +
                     `${priceText}\n`;
            }).join('\n');

            content += `\n* 본 리포트는 21:00 배치 스케줄러에 의해 자동 생성되었습니다.\n`;
            content += `⚠️ 본 리포트는 알고리즘에 의한 자동 분석 결과일 뿐이며, 투자 매수/매도 리딩이 아닙니다. 투자 결과에 대한 법적 책임을 지지 않으며, 모든 투자의 최종 판단과 책임은 투자자 본인에게 있습니다.`;

            if (approvedStocks.length > 0) {
              savePastRecommendations(approvedStocks);
            }

            for (const chatId of TELEGRAM_CHAT_IDS) {
              try {
                const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
                await axios.post(url, { chat_id: chatId, text: content }, { httpsAgent: new https.Agent({ family: 4 }) });
              } catch (e) { console.error(`[Telegram] 발송 실패 (${chatId}):`, e.message); }
            }
            console.log(`[Cron] 성공적으로 텔레그램에 야간 리포트를 전송했습니다.`);

        } catch(e) {
            console.error('[Cron Error] 야간 자동 발송 중 오류 발생:', e);
        }
    }, { timezone: "Asia/Seoul" });
}
