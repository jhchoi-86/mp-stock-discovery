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

// 플랜 3: 백엔드 무결성 자동 검증 시스템 가동
const { verifyIntegrity } = require('./src/utils/integrityGuard.cjs');
verifyIntegrity();

const cron = require('node-cron');
const { calculateSignals } = require('./analyzer.cjs');
const { savePastRecommendations, evaluatePastRecommendations, generateSummaryReport, EXCEL_FILE } = require('./src/utils/historyManager.cjs');
const { startNightlyMonitor } = require('./src/utils/nightlyMonitor.cjs');
const { Queue } = require('bullmq');
const redisClient = require('./platform/infra/redis/client.cjs');
const { verifyAndApprove } = require('./platform/approval/tdr_bridge/tdrGate.cjs');

const aiScoringQueue = new Queue('aiScoringQueue', { connection: redisClient });

const app = express();
const PORT = process.env.PORT || 3001;

// --- Platform 1.0 신규 라우터 연동 (Phase 2 T2-05) ---
app.use('/admin-api', require('./platform/interfaces/api_admin/index.cjs'));
app.use('/user-api', require('./platform/interfaces/api_user/index.cjs'));
// ----------------------------------------------------

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
    
    // Save Realtime webhook alert to DB
    try {
        const adminUser = await prisma.user.findFirst({ where: { email: 'admin@mpstock.co.kr' } });
        if (adminUser) {
            await prisma.report.create({
                data: { content: text, authorId: adminUser.id }
            });
            console.log(`[Telegram] Saved Realtime Alert to VIP DB`);
        }
    } catch(dbErr) {
        console.error('[Telegram DB Error]', dbErr);
    }
}

// KIS API Setup
const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();
let kisAccessToken = null;
let kisTokenExpiry = 0;

const TOKEN_DIR = path.join(__dirname, 'data');
const KIS_TOKEN_FILE = path.join(TOKEN_DIR, 'kis_token.json');

// 🔴 [Red Team 방어 - R3] KIS API 429 서킷브레이커 비동기 영속화(Debounce)
let kisCircuit = { bypass: false, bypassUntil: 0 };
const CIRCUIT_FILE = path.join(TOKEN_DIR, 'kis_circuit_breaker.json');

// 기동 시 서킷브레이커 상태 복원
try {
    if (fs.existsSync(CIRCUIT_FILE)) {
        kisCircuit = JSON.parse(fs.readFileSync(CIRCUIT_FILE, 'utf8'));
        if (kisCircuit.bypass && Date.now() > kisCircuit.bypassUntil) {
            kisCircuit.bypass = false; // 쿨다운 만료
        }
    }
} catch (e) {}

let circuitSaveTimer = null;
const saveCircuitState = () => {
    if (circuitSaveTimer) clearTimeout(circuitSaveTimer);
    circuitSaveTimer = setTimeout(() => {
        fs.promises.writeFile(CIRCUIT_FILE, JSON.stringify(kisCircuit, null, 2))
            .catch(err => console.error('[CircuitSave Error]', err));
    }, 1000); // 1초 디바운스 (이벤트 루프 블로킹 100% 방지)
};

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
// 🔴 [Red Team 방어 - R8-B] 전역 DB 커넥션 풀 싱글턴 패턴 적용
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

// 🔴 [Red Team 방어 - R2] signals.json 원자적(Atomic) 락 시스템
let isSignalFileLocked = false;
const signalWriteQueue = [];

async function withSignalLock(fn) {
    return new Promise((resolve, reject) => {
        const execute = async () => {
            if (isSignalFileLocked) {
                signalWriteQueue.push(execute);
                return;
            }
            isSignalFileLocked = true;
            try {
                resolve(await fn());
            } catch (e) {
                reject(e);
            } finally {
                isSignalFileLocked = false;
                if (signalWriteQueue.length > 0) {
                    signalWriteQueue.shift()();
                }
            }
        };
        execute();
    });
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initial stock master data
if (!fs.existsSync(STOCK_MASTER_FILE)) {
    // Basic setup, actual data is loaded dynamically
    fs.writeFileSync(STOCK_MASTER_FILE, JSON.stringify([], null, 2));
}

// Ensure signals.json exists
if (!fs.existsSync(SIGNALS_FILE)) {
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify([], null, 2));
}


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

// Phase 12: High-Concurrency In-Memory Stringified Cache
let CACHED_STOCKS = '[]';
let CACHED_SIGNALS = '[]';
let lastStocksMtimeMs = 0;
let lastSignalsMtimeMs = 0;

setInterval(async () => {
    try {
        const stocksStat = await fs.promises.stat(STOCK_MASTER_FILE);
        if (stocksStat.mtimeMs > lastStocksMtimeMs) {
            CACHED_STOCKS = await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8');
            lastStocksMtimeMs = stocksStat.mtimeMs;
        }
    } catch(e) {}
    
    try {
        const signalsStat = await fs.promises.stat(SIGNALS_FILE);
        if (signalsStat.mtimeMs > lastSignalsMtimeMs) {
            CACHED_SIGNALS = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
            lastSignalsMtimeMs = signalsStat.mtimeMs;
        }
    } catch(e) {}
}, 5000);

// Phase 12-2 Zero-Day Patch: Lightweight Auth Guard (No DB Hits)
const requireProAuth = (req, res, next) => {
    const token = req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        if (decoded.role === 'GUEST' || decoded.role === 'PENDING') {
            return res.status(403).json({ error: '결제/승인된 회원만 접근 가능합니다.' });
        }
        res.userRole = decoded.role;
        next();
    } catch (e) {
        return res.status(401).json({ error: '세션이 만료되었습니다.' });
    }
};

app.get('/api/stocks', requireProAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(CACHED_STOCKS);
});

app.get('/api/signals', requireProAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(CACHED_SIGNALS);
});

// SSE Clients
let clients = [];
const jwt = require('jsonwebtoken');

app.get('/api/stream', (req, res) => {
    const token = req.cookies?.accessToken;
    let role = 'GUEST';
    let userId = null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            role = decoded.role;
            userId = decoded.userId;
        } catch(e) {}
    }

    if (role === 'GUEST' || role === 'PENDING') {
        return res.status(403).json({ error: 'SSE 연결 권한이 없습니다.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Prevent Nginx from buffering SSE
    res.flushHeaders();

    res.userRole = role;
    res.userId = userId;
    clients.push(res);
    console.log(`[SSE] Client connected (${role}, ID: ${userId}). Total clients: ${clients.length}`);

    req.on('close', () => {
        clients = clients.filter(client => client !== res);
        console.log(`[SSE] Client disconnected. Total clients remaining: ${clients.length}`);
    });
});

app.get('/api/admin/online-users', (req, res) => {
    const token = req.cookies?.accessToken;
    let isAdmin = false;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            if (decoded.role === 'ADMIN') isAdmin = true;
        } catch(e) {}
    }
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
    
    // Extract unique userIds from active SSE clients
    const onlineIds = [...new Set(clients.map(c => c.userId).filter(Boolean))];
    res.json(onlineIds);
});

const broadcastUpdate = () => {
    clients.forEach(client => client.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`));
};

// Webhook Receiver
app.post('/api/webhook', async (req, res) => {
    // 🔴 [Red Team 방어 - R8-C] Webhook 무단 주입 방어 (Bearer 인증)
    const authHeader = req.headers['authorization'];
    const expectedSecret = process.env.CORE_INTEGRITY_HASH;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        console.warn(`[SECURITY] 무단 일반 Webhook 접근 차단 (IP: ${req.ip})`);
        return res.status(401).json({ error: 'Unauthorized Webhook Access' });
    }

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

    // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
    await withSignalLock(async () => {
        const signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
        signals.push(newSignal);
        await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify(signals, null, 2));
    });

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

// ✅ Phase 8: Sniper Engine Webhook Receiver
app.post('/api/sniper/webhook', async (req, res) => {
    // 🔴 [Red Team 방어] Webhook 인증 검사 (Bearer Token)
    const authHeader = req.headers['authorization'];
    const expectedSecret = process.env.CORE_INTEGRITY_HASH;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        console.warn(`[SECURITY] 무단 Webhook 접근 차단 (IP: ${req.ip})`);
        return res.status(401).json({ error: 'Unauthorized Webhook Access' });
    }

    const payload = req.body;
    if (!payload || !payload.signal_id) return res.status(400).json({ error: 'Invalid payload' });

    try {
        // 1. DB 제어 (ENTRY는 Upsert, EXIT_WARN은 Update)
        if (payload.type === 'ENTRY') {
            await prisma.sniperSignal.upsert({
                where: { signalId: payload.signal_id },
                update: {},
                create: {
                    signalId: payload.signal_id,
                    ticker: payload.ticker,
                    type: payload.type,
                    entryPrice: payload.price,
                    time: payload.time,
                    grade: payload.grade || null,
                    score: payload.score || null,
                    momentum: payload.momentum || {}
                }
            });
        } else if (payload.type === 'EXIT_WARN') {
            await prisma.sniperSignal.updateMany({
                where: { signalId: payload.signal_id },
                data: {
                    isExited: true,
                    exitPrice: payload.price,
                    exitReason: payload.reason || 'None'
                }
            });
        }

        // 2. 어드민 전용 SSE 브로드캐스트 (Red Team 방어)
        const eventData = `data: ${JSON.stringify({ type: 'sniper_alert', payload })}\n\n`;
        clients.forEach(client => {
            if (client.userRole === 'ADMIN') { 
                // 어드민에게만 스나이퍼 속보 알림
                client.write(eventData);
            }
        });

        res.status(200).json({ message: 'Sniper webhook processed' });
    } catch (error) {
        console.error("[Sniper Webhook] Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// CSV Batch Import
app.post('/api/import-csv', requireProAuth, async (req, res) => {
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

        // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
        await withSignalLock(async () => {
            const signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
            const merged = [...signals, ...newSignals];
            await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify(merged, null, 2));
        });

        console.log(`[Batch Import] ${newSignals.length} signals imported via CSV.`);
        broadcastUpdate();

        res.status(200).json({ message: `${newSignals.length}개의 종목이 성공적으로 불러와졌습니다.`, count: newSignals.length });
    } catch (error) {
        console.error("CSV Import Error:", error);
        res.status(500).json({ error: 'CSV 분석 중 오류가 발생했습니다.' });
    }
});

// Reset all tracking data
app.post('/api/reset', requireProAuth, async (req, res) => {
    try {
        // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
        await withSignalLock(async () => {
            await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify([], null, 2));
        });
        alertCache.clear();
        res.json({ message: '모든 분석 데이터가 초기화되었습니다.' });
    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ error: '초기화 중 오류가 발생했습니다.' });
    }
});

// Global Mutex to prevent multiple auto-syncs from overlapping and DDOSing the KIS API (EGW00201)
let isSyncMutexLocked = false;

// Auto-Sync with Yahoo Finance & KIS Realtime
app.post('/api/auto-sync', async (req, res) => {
    // Phase 12: Admin & PRO guard for Auto-Sync DDOS prevention
    let isAllowed = false;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.cookies?.accessToken;
    let debugRole = 'NONE';
    if (token) {
        try {
            const decoded = require('jsonwebtoken').verify(token, process.env.JWT_ACCESS_SECRET);
            debugRole = decoded.role;
            if (decoded.role === 'ADMIN' || decoded.role === 'PAID' || decoded.role === 'PRO_USER') isAllowed = true;
        } catch(e) {
            console.error('[Auto-Sync] JWT Verify Error:', e.message);
        }
    } else {
        console.error('[Auto-Sync] Missing accessToken cookie in req.cookies!');
    }
    // 🔴 [Red Team 방어 - V3 패치] X-Forwarded-For IP Spoofing 방어 (커스텀 헤더 인증)
    const isLocalCron = process.env.CRON_SECRET && req.headers['x-internal-cron-secret'] === process.env.CRON_SECRET;
    
    if (!isAllowed && !isLocalCron) {
        console.error(`[Auto-Sync] Rejected sync origin: ${req.ip}, Role: ${debugRole}, TokenExists: ${!!token}`);
        return res.status(403).json({ error: '권한이 없습니다. 자동 동기화는 PRO 회원 또는 관리자 전용입니다.' });
    }

    // Fail-fast Mutual Exclusion: Prevent race conditions & DoS
    if (isSyncMutexLocked) {
        return res.status(409).json({ error: '현재 다른 사용자에 의해 분석 갱신이 진행 중입니다. 잠시 후(1~2분 뒤) 다시 시도해주세요' });
    }
    isSyncMutexLocked = true;
    const { timeframe, timeframes } = req.body;
    const tfList = Array.isArray(timeframes) && timeframes.length > 0 ? timeframes : [(timeframe || '1D')];
    
    // Nginx 60s Timeout 방어: 즉시 200 응답 스풀링 (Fire-and-Forget)
    res.status(200).json({ 
        message: '동기화가 백그라운드에서 안전하게 시작되었습니다. 약 3~4분 후 완료 시 화면에 자동 반영됩니다!', 
        count: 0 
    });

    (async () => {
        try {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            let kisTokenGlobal = null;
            try {
                kisTokenGlobal = await getKisAccessToken();
            } catch(e) {
                console.error("[Auto-Sync] KIS Token failed, falling back to pure Yahoo.");
            }
            
            for (const tf of tfList) {
                const intervalMap = { '5M': '5m', '15M': '15m', '30M': '30m', '1H': '1h', '2H': '1h', '4H': '1h', '1D': '1d', '1W': '1wk' };
                const interval = intervalMap[tf] || '1d';

                const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE));
                let syncResults = [];
                let errorCount = 0;

                console.log(`[Auto-Sync] Starting sync for ${stocks.length} stocks at ${tf} timeframe...`);

                const emitProgress = (cur, tot, t) => {
                    const payload = `data: ${JSON.stringify({ type: 'sync_progress', current: cur, total: tot, timeframe: t })}\n\n`;
                    clients.forEach(c => { 
                        try { 
                            c.write(payload); 
                            if(c.flush) c.flush();
                        } catch(e) {} 
                    });
                };

                emitProgress(0, stocks.length, tf);

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
        if (kisTokenGlobal && (!kisCircuit.bypass || Date.now() > kisCircuit.bypassUntil)) {
            kisCircuit.bypass = false; // 쿨다운 통과 시 해제
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
                if (!kisData || !kisData.stck_prpr) {
                    throw new Error(`KIS API returned invalid output: ${JSON.stringify(kisRes.data)}`);
                }
                const currentPrice = parseInt(kisData.stck_prpr);
                const currentHigh = parseInt(kisData.stck_hgpr);
                const currentLow = parseInt(kisData.stck_lwpr);
                const currentOpen = parseInt(kisData.stck_oprc);
                const currentVolume = parseInt(kisData.acml_vol);
                const tradeAmount = parseInt(kisData.acml_tr_pbmn);
                
                let foreignBuy = '-';
                let instBuy = '-';
                let frgnScore = 0;
                let orgnScore = 0;
                let ssangScore = 0;
                let penaltyScore = 0;
                
                try {
                    const invUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor';
                    const invRes = await axios.get(invUrl, {
                        headers: {
                            'authorization': 'Bearer ' + kisTokenGlobal,
                            'appkey': KIS_APP_KEY,
                            'appsecret': KIS_APP_SECRET,
                            'tr_id': 'FHKST01010900'
                        },
                        params: {
                            "FID_COND_MRKT_DIV_CODE": "J",
                            "FID_INPUT_ISCD": stock.code
                        },
                        timeout: 5000
                    });
                    const out = invRes.data.output;
                    if (out && out.length > 0) {
                        const frgn = parseInt(out[0].frgn_ntby_qty || '0');
                        const orgn = parseInt(out[0].orgn_ntby_qty || '0');
                        const prsn = parseInt(out[0].prsn_ntby_qty || '0');
                        
                        if (frgn === 0 && orgn === 0 && prsn === 0) {
                            foreignBuy = '장마감 후 집계';
                            instBuy = '장마감 후 집계';
                        } else {
                            foreignBuy = frgn >= 0 ? `+${frgn.toLocaleString()}주` : `${frgn.toLocaleString()}주`;
                            instBuy = orgn >= 0 ? `+${orgn.toLocaleString()}주` : `${orgn.toLocaleString()}주`;
                        }
                        
                        if (frgn > 0) frgnScore = 3;
                        if (orgn > 0) orgnScore = 3;
                        if (frgn > 0 && orgn > 0 && prsn < 0) ssangScore = 5;
                        
                        if (frgn < 0 && orgn < 0 && prsn > 0) penaltyScore = -3;
                    }
                } catch(e) {
                    if (e.response && e.response.status === 429) {
                        console.error(`[KIS Investor API 429] 10분간 KIS 통신 차단 (서킷브레이커 작동)`);
                        kisCircuit.bypass = true;kisCircuit.bypassUntil = Date.now() + (10 * 60 * 1000);saveCircuitState();
                    }
                }

                chartData.kis_change_data = {
                    sign: kisData.prdy_vrss_sign,
                    change: parseInt(kisData.prdy_vrss),
                    rate: parseFloat(kisData.prdy_ctrt),
                    trade_amount: tradeAmount,
                    foreign_buy: foreignBuy,
                    inst_buy: instBuy,
                    bonus_score: (frgnScore + orgnScore + ssangScore + penaltyScore)
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
                } else {
                    console.error(`[KIS API Silent Crash] ${stock.code}:`, e.message, e.response?.data || '');
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

    // Process strictly sequentially (KIS API strict limit: 20 req/sec total burst capacity)
    // 100ms interval guarantees a permanently safe sub-10 TPS environment regardless of packet latency sizes.
    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        try {
            const history = await fetchHybridHistory(stock);
            if (history && history.close && history.close.length > 50) {
                const signal = calculateSignals(history, tf);
                if (signal) {
                    syncResults.push({ ...signal, code: stock.code, name: stock.name, timeframe: tf, timestamp: Date.now(), id: uuidv4(), kis_change_data: history.kis_change_data });
                }
            }
        } catch (e) {
            console.error(`[Auto-Sync] Error for ${stock.code} (${stock.name}):`, e.message);
            errorCount++;
        }
        
        if (i > 0 && i % 50 === 0) {
            console.log(`[Auto-Sync] Processed ${i}/${stocks.length} stocks...`);
        }
        
        // Emit progress to clients every 10 stocks
        if ((i + 1) % 10 === 0) emitProgress(i + 1, stocks.length, tf);

        await sleep(250); 
    }

    emitProgress(stocks.length, stocks.length, tf);

    if (syncResults.length > 0) {
        // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
        await withSignalLock(async () => {
            let currentSignals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
            
            // Remove old signals for the matching code and timeframe
            const syncCodes = new Set(syncResults.map(s => s.code));
            currentSignals = currentSignals.filter(s => !(syncCodes.has(s.code) && s.timeframe === tf));

            const merged = [...currentSignals, ...syncResults];
            await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify(merged, null, 2));
        });
        broadcastUpdate();
    }

    console.log(`[Auto-Sync] Completed timeframe ${tf}. Success: ${syncResults.length}, Errors: ${errorCount}`);
            } // End of tfList loop

            console.log(`[Auto-Sync] All requested timeframes completed.`);
        } catch (globalErr) {
            console.error('[Auto-Sync Background Error]', globalErr);
        } finally {
            // Drop the mutex lock regardless of success or crash
            isSyncMutexLocked = false;
        }
    })();
});

// 🔴 [Red Team 방어 - R6] AWS PM2 롤백 스크립트를 위한 헬스체크 도입
app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
});

// 🔴 [Red Team 방어 - R4] AI 엔진 지연시간 해소 (Cron 루프 외부 1회성 로드)
const pingAIService = () => {
    axios.get('http://127.0.0.1:8000/api/v1/health', { timeout: 3000 })
        .then(() => console.log('[AI Engine] Successfully connected to FastAPI!'))
        .catch(e => console.error('[AI Engine] Not accessible on boot:', e.message));
};

// --- [Background Tasks / Scheduler Guard] ---
// PM2 클러스터 모드(instances: 'max') 적용 시 코어 수만큼 백그라운드 스케줄러가
// 중복 실행되는 것을 방지하기 위해, 오직 0번 워커(Primary)에서만 동작하도록 제한합니다.
const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0' || typeof process.env.NODE_APP_INSTANCE === 'undefined';
if (isPrimaryWorker) {
    console.log('[Scheduler] Primary worker initialized scheduling tasks.');
    
    // Phase 11: Real-time Entry Sniper Monitoring
    startNightlyMonitor(getKisAccessToken, {
        KIS_APP_KEY,
        KIS_APP_SECRET,
        TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_IDS
    });

    cron.schedule('0 21 * * 1-5', async () => {
        console.log('[Cron] 자동 종목 발굴 및 텔레그램 발송 시작...');
        try {
            const localApi = `http://127.0.0.1:${PORT}/api/auto-sync`;
            console.log('[Cron] 1D 및 2H 일괄 동기화 시작...');
            await axios.post(localApi, { timeframes: ['1D', '2H'] }, {
                headers: { 'x-internal-cron-secret': process.env.CRON_SECRET }
            });

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
              
              // 1️⃣ 베스트 타임프레임 코어 점수 (Max 50점) - 최우선 평가
              let coreScore = 0;
              const tfs = ['2H', '1D', '1W'];
              
              tfs.forEach(tf => {
                let tfScore = 0;
                if (tfSigs[tf] && tfSigs[tf].cond_up7) tfScore += 25;
                if (tfSigs[tf] && (tfSigs[tf].signal_HH || tfSigs[tf].DHH2)) tfScore += 25;
                if (tfScore > coreScore) coreScore = tfScore; 
              });
              score += coreScore;
              
              // 2️⃣ 장기 수급 폭발 보너스 (거래량) (Max 10점)
              if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
              if (tfSigs['1W'] && tfSigs['1W'].trigger_vol) score += 5;

              // 3️⃣ 스나이퍼 진입 타점 정밀도 (Max 10점)
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

              // 4️⃣ 다중 시간대(MTF) 프랙탈 매수 보너스 (Max 30점)
              if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) score += 10;
              if (tfSigs['1D'] && (tfSigs['1D'].signal_HH || tfSigs['1D'].DHH2)) score += 10;
              if (tfSigs['1W'] && (tfSigs['1W'].signal_HH || tfSigs['1W'].DHH2)) score += 10;

              const bonus = latest?.kis_change_data?.bonus_score || 0;
              score += bonus;

              return { ...stock, timeframeStatus: tfSigs, latestSignal: latest, total_score: Math.min(score, 100) };
            }).filter(s => s.latestSignal);

            // All candidates are allowed without ADX and strict trend filters, relying only on final AI total_score sorting

            const kisToken = await getKisAccessToken();
            candidates = candidates.sort((a, b) => b.total_score - a.total_score);

            if (candidates.length === 0) {
              console.log('[Cron] 조건에 맞는 종목이 없어 발송하지 않습니다.');
              return;
            }

            // Sniper & Telegram target is now strictly the Top 10 scored stocks
            const approvedStocks = candidates.slice(0, 10);
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

            let content = `📈 MP KOSPI 200, KOSDAQ 150 매수 추천 리서치 (자동발송)\n`;
            content += `생성 일시: ${new Date().toLocaleString()}\n`;
            if (reviewText) content += reviewText;
            if (weeklyText) content += weeklyText;
            if (monthlyText) content += monthlyText;
            content += `분석 종목 수: ${candidates.length}개\n\n`;

            let aiCommentsMap = {};
            if (approvedStocks.length > 0) {
              try {
                // 1. Python 마이크로서비스 호출 (T5-02)
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
                
                // 2. 15초 Timeout Fallback 방어 로직 적용 (V5 패치)
                const aiRes = await axios.post('http://127.0.0.1:8000/api/v1/generate-comment', 
                  { stocks: aiPayload }, 
                  { timeout: 15000 }
                );
                
                let commentsArray = [];
                if (aiRes.data && Array.isArray(aiRes.data)) {
                  commentsArray = aiRes.data;
                } else if (aiRes.data && Array.isArray(aiRes.data.data)) {
                  commentsArray = aiRes.data.data;
                }
                
                commentsArray.forEach(item => {
                  if (item.symbol) aiCommentsMap[item.symbol] = item.ai_comment;
                });
              } catch (aiErr) {
                console.error('[AI Service LLM Fallback] Failed to fetch LLM comments:', aiErr.message);
                // 실패 시 에러만 남기고 조용히 Fallback (기본 텍스트 템플릿 사용)
              }

              content += `🔥 [추천 종목 감시 명단]\n`;
              approvedStocks.forEach(s => {
                const tfSigs = s.timeframeStatus || {};
                const sig2H = tfSigs['2H'];
                
                const curPrice = s.latestSignal?.current_price || s.latestSignal?.entry_price || 0;
                let curChange = 0;
                if (s.latestSignal?.kis_change_data) {
                  const kd = s.latestSignal.kis_change_data;
                  const isUp = ['1', '2', '3'].includes(String(kd.sign));
                  curChange = isUp ? Math.abs(parseFloat(kd.rate)||0) : -Math.abs(parseFloat(kd.rate)||0);
                }
                const score = s.total_score || 0;
                const stars = '★'.repeat(Math.max(0, Math.min(5, Math.round(score / 20)))) + '☆'.repeat(Math.max(0, Math.min(5, 5 - Math.round(score / 20))));
                
                let priceText = "-";
                if (sig2H && sig2H.ema5 > 0) {
                  const formatGap = (target) => {
                    if (!curPrice || typeof target !== 'number') return '';
                    const diff = Math.round(target - curPrice);
                    const sign = diff > 0 ? '+' : '';
                    const pct = ((target - curPrice) / curPrice * 100).toFixed(2);
                    return `(${sign}${diff.toLocaleString()}원, ${pct}%)`;
                  };
                  const formatProfit = (target) => {
                    if (!curPrice || typeof target !== 'number') return '';
                    const diff = Math.round(target - curPrice);
                    const sign = diff >= 0 ? '⬆️' : '⬇️';
                    const pct = Math.abs((target - curPrice) / curPrice * 100).toFixed(2);
                    return `${sign} ${pct}%`;
                  };
                  const curPriceStr = curPrice > 0 ? `현재가: ${Math.round(curPrice).toLocaleString()}원 (${curChange >= 0 ? '⬆️' : '⬇️'}${Math.abs(curChange).toFixed(2)}%)` : '';
                  
                  priceText = `${curPriceStr}\n` +
                              `돌파 매수타점: ${Math.round(sig2H.ema5).toLocaleString()}원 ${formatGap(sig2H.ema5)}\n` +
                              `1차 매수타점: ${Math.round(sig2H.result_2).toLocaleString()}원 ${formatGap(sig2H.result_2)}\n` +
                              `2차 매수타점: ${Math.round(sig2H.result_3).toLocaleString()}원 ${formatGap(sig2H.result_3)}\n` +
                              `1차목표가(2H): ${Math.round(sig2H.bb_upper).toLocaleString()}원 ${formatProfit(sig2H.bb_upper)}`;
                } else {
                  priceText = `${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2).toLocaleString()}원`;
                }
                
                content += `🔹 ${s.name} (${s.code})\n`;
                content += `분류: ${s.latestSignal.category} | 총점: ${stars} (${score}점)\n`;
                
                // T5-03 & T5-04 연동: 비동기 큐 잡 푸시 (Non-blocking)
                verifyAndApprove(s).then(approval => {
                  if (approval && approval.status === 'PASS') {
                    // DB 저장 성공이라 가정하고 (Mock) ML 워커에게 분석 요청 넘김. 응답은 기다리지 않음.
                    aiScoringQueue.add('scorePredict', {
                      candidateId: approval.candidateId || s.code,
                      symbol: s.code,
                      category: s.latestSignal.category,
                      indicators: {
                        score: score,
                        adx: s.latestSignal.adx || 0
                      }
                    }, { removeOnComplete: true, removeOnFail: 1000 }).catch(err => console.error('[BullMQ] Queue Add Error:', err));
                  }
                }).catch(err => console.error('[TDRGate] Error:', err));
                
                if (aiCommentsMap[s.code]) {
                  content += `💡 AI 코멘트: ${aiCommentsMap[s.code]}\n`;
                }
                
                content += `${priceText}\n`;
                content += `차트: https://kr.tradingview.com/chart/?symbol=KRX:${s.code}\n\n`;
              });
              content += `---\n\n`;
            }

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
            
            // Save Nightly cron alert to DB
            try {
              const adminUser = await prisma.user.findFirst({ where: { email: 'admin@mpstock.co.kr' } });
              if (adminUser) {
                  await prisma.report.create({
                      data: { content: content, authorId: adminUser.id }
                  });
                  console.log(`[Cron] Saved Nightly Report to VIP DB`);
              }
            } catch(dbErr) {
                console.error('[Cron DB Error]', dbErr);
            }

        } catch(e) {
            console.error('[Cron Error] 야간 자동 발송 중 오류 발생:', e);
        }
    }, { timezone: "Asia/Seoul" });
}

// ==========================================
// Phase 5: Ensure the server binds to the port and signals PM2
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[REST API] Server is successfully running on port ${PORT}`);
    // PM2 배포 무중단 리로드를 위해 반드시 필요한 신호방출 코드
    if (process.send) {
        process.send('ready');
        console.log(`[PM2] Sent 'ready' signal for zero-downtime deployment.`);
    }
    // R4: 백그라운드 AI 엔진 웜업 핑 (1회성)
    setTimeout(pingAIService, 5000);
});
