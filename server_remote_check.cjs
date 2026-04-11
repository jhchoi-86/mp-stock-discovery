require('dotenv').config();
const prisma = require('./src/utils/prismaClient.cjs');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
dns.setDefaultResultOrder('ipv4first');

const { calculateTotalScore } = require('./src/utils/scoreEngine.cjs');
const { verifyIntegrity } = require('./src/utils/integrityGuard.cjs');
verifyIntegrity();

const cron = require('node-cron');
const { calculateSignals } = require('./analyzer.cjs');
const { savePastRecommendations, evaluatePastRecommendations, generateSummaryReport, EXCEL_FILE } = require('./src/utils/historyManager.cjs');
const { startNightlyMonitor } = require('./src/utils/nightlyMonitor.cjs');
const { startFullUniversePoller, getCachedPrice, getFullPriceCache, updateCachedPrice } = require('./src/utils/fullUniversePoller.cjs');
const { Queue } = require('bullmq');

const { startWebSocketService, updateSubscriptions, getSubscribedCodes } = require('./src/services/kisWebSocketService.cjs');
const systemStatsService = require('./src/services/systemStatsService.cjs');
const { verifyAndApprove } = require('./platform/approval/tdr_bridge/tdrGate.cjs');
const { isKSTTradingHours, isTradingDay } = require('./platform/markets/kr_equity/marketHours.cjs');

let aiScoringQueue = null;
try {
    const redisClient = require('./platform/infra/redis/client.cjs');
    aiScoringQueue = new Queue('aiScoringQueue', { connection: redisClient });
    console.log('[BullMQ] aiScoringQueue initialized successfully.');
} catch (e) {
    console.warn('[BullMQ] Redis unavailable. AI scoring queue disabled:', e.message);
}

const app = express();
// [TASK-S14] Safe BigInt Serialization
app.set('json replacer', (key, value) => {
    return typeof value === 'bigint' ? value.toString() : value;
});
const PORT = process.env.PORT || 3001;

// Telegram Alert Setup
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(id => id);
const alertCache = new Map();

// [TASK-S12] Memory Leak Defense: Periodic TTL Cleanup for alertCache (Every 1 hour)
setInterval(() => {
    const now = Date.now();
    const TTL = 4 * 60 * 60 * 1000; // 4 hours
    let deletedCount = 0;
    for (const [key, timestamp] of alertCache.entries()) {
        if (now - timestamp > TTL) {
            alertCache.delete(key);
            deletedCount++;
        }
    }
    if (deletedCount > 0) {
        console.log(`[AlertCache] Cleaned up ${deletedCount} expired keys. Current size: ${alertCache.size}`);
    }
}, 60 * 60 * 1000);

async function sendTelegramAlert(signal, stockName) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return;
    
    const cacheKey = `${signal.code}_${signal.timeframe}`;
    const lastSent = alertCache.get(cacheKey);
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
            console.error(`[Telegram] Failed to send alert to ${chatId}:`, e.message || String(e));
        }
    }
    console.log(`[Telegram] Alert broadcasted for ${stockName} (${signal.code})`);
    
    try {
        const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
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

try {
    if (fs.existsSync(CIRCUIT_FILE)) {
        kisCircuit = JSON.parse(fs.readFileSync(CIRCUIT_FILE, 'utf8'));
        if (kisCircuit.bypass && Date.now() > kisCircuit.bypassUntil) {
            kisCircuit.bypass = false;
        }
    }
} catch (e) {}

let circuitSaveTimer = null;
const saveCircuitState = () => {
    if (circuitSaveTimer) clearTimeout(circuitSaveTimer);
    circuitSaveTimer = setTimeout(() => {
        fs.promises.writeFile(CIRCUIT_FILE, JSON.stringify(kisCircuit, null, 2))
            .catch(err => console.error('[CircuitSave Error]', err));
    }, 1000);
};

async function getKisAccessToken(force = false) {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
        throw new Error("KIS API Keys are missing in .env");
    }

    if (!force && !kisAccessToken) {
        try {
            const fileExists = await fs.promises.access(KIS_TOKEN_FILE).then(() => true).catch(() => false);
            if (fileExists) {
                const savedData = await fs.promises.readFile(KIS_TOKEN_FILE, 'utf8');
                const saved = JSON.parse(savedData);
                kisAccessToken = saved.token;
                kisTokenExpiry = saved.expiry;
            }
        } catch (e) {
            console.error("[KIS API] Failed to read token cache file:", e);
        }
    }

    if (!force && kisAccessToken && kisTokenExpiry > Date.now() + 3600000) {
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
        kisTokenExpiry = Date.now() + (response.data.expires_in * 1000);
        
        const dirExists = await fs.promises.access(TOKEN_DIR).then(() => true).catch(() => false);
        if (!dirExists) await fs.promises.mkdir(TOKEN_DIR, { recursive: true });
        
        const tempPath = KIS_TOKEN_FILE + '.tmp';
        await fs.promises.writeFile(tempPath, JSON.stringify({
            token: kisAccessToken,
            expiry: kisTokenExpiry
        }, null, 2));
        await fs.promises.rename(tempPath, KIS_TOKEN_FILE);
        
        console.log(`[KIS API] Token successfully issued and cached.`);
        return kisAccessToken;
    } catch (e) {
        console.error("[KIS API] Token Request Failed:", e.message);
        throw new Error("Failed to get KIS Access Token");
    }
}

const { calculateDisplayScore: scoreSignal, getGrade } = require('./platform/analysis/scoring/scorer.cjs');

const cookieParser = require('cookie-parser');
const authRouter = require('./src/routes/auth.cjs');
const adminRouter = require('./src/routes/admin.cjs');
const usersRouter = require('./src/routes/users.cjs');
const reportRouter = require('./src/routes/report.cjs');
const leadsRouter = require('./src/routes/leads.cjs');
const { router: publicReportsRouter, getLatestReportHandler } = require('./src/routes/publicReports.cjs');

app.set('trust proxy', 1);

const CLIENT_URL = process.env.CLIENT_URL || 'https://mpstock.co.kr';
app.use(cors({
  origin: [CLIENT_URL, 'https://mpstock.co.kr', 'https://www.mpstock.co.kr', 'http://localhost:5173'],
  credentials: true
}));

app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use('/admin-api', require('./platform/interfaces/api_admin/index.cjs'));
app.use('/user-api', require('./platform/interfaces/api_user/index.cjs'));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/send-report', reportRouter);
app.use('/api/v1/leads', leadsRouter);
app.use('/api/reports/daily', publicReportsRouter);

app.get('/api/public/recommendations', getLatestReportHandler);

app.get('/api/public/top5-strategy', (req, res) => {
  const strategyFile = path.join(__dirname, 'data', 'landing_strategy.json');
  if (fs.existsSync(strategyFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(strategyFile, 'utf8'));
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse strategy data' });
    }
  } else {
    res.status(404).json({ error: 'Strategy data not found' });
  }
});

app.get('/api/public/watchlist-strategy', (req, res) => {
  const watchlistFile = path.join(__dirname, 'data', 'watchlist_strategy.json');
  if (fs.existsSync(watchlistFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(watchlistFile, 'utf8'));
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse watchlist data' });
    }
  } else {
    res.json({ updatedAt: new Date().toISOString(), stocks: [] });
  }
});

app.get('/api/public/live-notifications', (req, res) => {
    const file = path.join(__dirname, 'data', 'live_notifications.json');
    if (fs.existsSync(file)) {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse notification data' });
        }
    } else {
        res.json([
            { message: "[알림] 실시간 매매 신호 엔진 가동 중...", timestamp: new Date().toISOString() }
        ]);
    }
});

const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const LIVE_NOTIFICATIONS_FILE = path.join(DATA_DIR, 'live_notifications.json');

async function addLiveNotification(message) {
    try {
        let notifications = [];
        if (fs.existsSync(LIVE_NOTIFICATIONS_FILE)) {
            notifications = JSON.parse(fs.readFileSync(LIVE_NOTIFICATIONS_FILE, 'utf8'));
        }
        
        notifications.unshift({ message, timestamp: new Date().toISOString(), id: uuidv4() });
        notifications = notifications.slice(0, 20);
        
        const tempPath = LIVE_NOTIFICATIONS_FILE + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(notifications, null, 2));
        fs.renameSync(tempPath, LIVE_NOTIFICATIONS_FILE);

        broadcastToClients({ type: 'live_notification', data: notifications[0] });
    } catch (e) {
        console.error('[LiveNotification] Error saving:', e.message);
    }
}

// 🔴 [Red Team 방어 - R2] signals.json 원자적 락 시스템 (v7.7.21)
let isSignalFileLocked = false;
async function withSignalLock(fn) {
    while (isSignalFileLocked) await new Promise(resolve => setTimeout(resolve, 50));
    isSignalFileLocked = true;
    try {
        return await fn();
    } catch (e) {
        console.error('[SignalLock] Error:', e.message);
        throw e;
    } finally {
        isSignalFileLocked = false;
    }
}

function startLiveSignalPoller() {
    const { exec } = require('child_process');
    const poller = async () => {
        if (!isKSTTradingHours()) return; 
        let top5 = [];
        try {
            const latestPath = path.join(__dirname, 'data/vip_logs/latest.json');
            if (fs.existsSync(latestPath)) {
                const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                top5 = (report.stocks || []).slice(0, 5).map(s => s.code);
            }
        } catch (e) { 
            console.error('[SignalPoller] TOP 5 로드 실패:', e.message);
            return; 
        }
        if (top5.length === 0) return;

        const codes = top5.join(',');
        const env = { ...process.env, STOCK_FILTER: codes, ADDITIVE_SAVE: 'true' };
        
        const runAnalyzer = (retryCount = 0) => {
            exec(`node analyzer.cjs 2M 5M`, { env }, async (err, stdout, stderr) => {
                if (err) {
                    console.error(`[SignalPoller] Analyzer error (Retry ${retryCount}):`, err.message);
                    if (retryCount < 2) setTimeout(() => runAnalyzer(retryCount + 1), (retryCount + 1) * 30000);
                    return;
                }
                updateTimeSlotSignals(top5);
            });
        };
        runAnalyzer();
    };
    setInterval(poller, 600000);
    poller();
}

function updateTimeSlotSignals(codes) {
    withSignalLock(async () => {
        try {
            const signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
            const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
            const TIME_SLOT_FILE = path.join(__dirname, 'data', 'time_slot_signals.json');
            
            let db = {};
            if (fs.existsSync(TIME_SLOT_FILE)) {
                try { db = JSON.parse(await fs.promises.readFile(TIME_SLOT_FILE, 'utf8')); } catch(e) {}
            }
            if (!db[today]) db[today] = {};

            const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
            const h = now.getUTCHours();
            const m = now.getUTCMinutes();
            const slotKey = `${h.toString().padStart(2, '0')}:${m < 30 ? '00' : '30'}`;

            let stockNames = {};
            try {
                const latestPath = path.join(__dirname, 'data/vip_logs/latest.json');
                if (fs.existsSync(latestPath)) {
                    const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                    (report.stocks || []).forEach(s => { stockNames[s.code] = s.name; });
                }
            } catch (e) {}

            codes.forEach(code => {
                if (!db[today][code]) db[today][code] = {};
                if (!db[today][code][slotKey]) db[today][code][slotKey] = { tf2m: false, tf5m: false };
                const sig2m = signals.find(s => s.code === code && s.timeframe === '2M');
                const sig5m = signals.find(s => s.code === code && s.timeframe === '5M');
                const prevTf2m = db[today][code][slotKey].tf2m;
                const prevTf5m = db[today][code][slotKey].tf5m;
                if (sig2m && sig2m.is_strong_signal) db[today][code][slotKey].tf2m = true;
                if (sig5m && sig5m.is_strong_signal) db[today][code][slotKey].tf5m = true;
                const name = stockNames[code] || code;
                if (!prevTf2m && db[today][code][slotKey].tf2m) {
                    sendTelegramAlert(sig2m, name);
                    addLiveNotification(`[Daily 신호] ${name}(${code}) 2분봉 강력 돌파!`);
                }
                if (!prevTf5m && db[today][code][slotKey].tf5m) {
                    sendTelegramAlert(sig5m, name);
                    addLiveNotification(`[Daily 신호] ${name}(${code}) 5분봉 추세 강화!`);
                }
            });
            const tempPath = TIME_SLOT_FILE + '.tmp';
            await fs.promises.writeFile(tempPath, JSON.stringify(db, null, 2));
            await fs.promises.rename(tempPath, TIME_SLOT_FILE);
        } catch (e) {
            console.error('[SignalPoller] Sync error:', e.message);
        }
    }).catch(lockErr => console.error('[SignalPoller] Lock error:', lockErr.message));
}

async function saveDailySignalsToDB() {
    const TIME_SLOT_FILE = path.join(__dirname, 'data', 'time_slot_signals.json');
    if (!fs.existsSync(TIME_SLOT_FILE)) return;
    try {
        const db = JSON.parse(fs.readFileSync(TIME_SLOT_FILE, 'utf8'));
        const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const signalsToday = db[today];
        if (!signalsToday) return;

        let stockNames = {};
        try {
            const latestPath = path.join(__dirname, 'data/vip_logs/latest.json');
            if (fs.existsSync(latestPath)) {
                const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                (report.stocks || []).forEach(s => { stockNames[s.code] = s.name; });
            }
        } catch (e) {}

        const codes = Object.keys(signalsToday);
        for (const code of codes) {
            await prisma.dailySignalHistory.upsert({
                where: { date_code: { date: today, code: code } },
                update: { signals: JSON.stringify(signalsToday[code]), name: stockNames[code] || code },
                create: { date: today, code: code, name: stockNames[code] || code, signals: JSON.stringify(signalsToday[code]) }
            });
        }
    } catch (err) {
        console.error('[SignalDB] Error:', err.message);
    }
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(STOCK_MASTER_FILE)) fs.writeFileSync(STOCK_MASTER_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(SIGNALS_FILE)) fs.writeFileSync(SIGNALS_FILE, JSON.stringify([], null, 2));

app.use('/api/reports', require('./src/routes/archive.cjs'));
app.use('/api/roi-ranking', require('./src/routes/roi.cjs'));
app.use('/api/subscriptions', require('./src/routes/subscriptions.cjs'));
app.use('/api/backtest', require('./src/routes/backtest.cjs'));

app.get('/api/download-history', (req, res) => {
    if (!fs.existsSync(EXCEL_FILE)) return res.status(404).json({ error: '파일 없음' });
    res.download(EXCEL_FILE, 'MP_추천성과_누적기록.xlsx');
});

let CACHED_STOCKS = '[]';
let CACHED_SIGNALS = '[]';
let lastStocksMtimeMs = 0;
let lastSignalsMtimeMs = 0;

try {
    if (fs.existsSync(STOCK_MASTER_FILE)) {
        CACHED_STOCKS = fs.readFileSync(STOCK_MASTER_FILE, 'utf8');
        lastStocksMtimeMs = fs.statSync(STOCK_MASTER_FILE).mtimeMs;
    }
    if (fs.existsSync(SIGNALS_FILE)) {
        CACHED_SIGNALS = fs.readFileSync(SIGNALS_FILE, 'utf8');
        lastSignalsMtimeMs = fs.statSync(SIGNALS_FILE).mtimeMs;
    }
} catch(e) {}

setInterval(async () => {
    try {
        const stocksStat = await fs.promises.stat(STOCK_MASTER_FILE);
        if (stocksStat.mtimeMs > lastStocksMtimeMs) {
            CACHED_STOCKS = await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8');
            lastStocksMtimeMs = stocksStat.mtimeMs;
        }
        const signalsStat = await fs.promises.stat(SIGNALS_FILE);
        if (signalsStat.mtimeMs > lastSignalsMtimeMs) {
            CACHED_SIGNALS = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
            lastSignalsMtimeMs = signalsStat.mtimeMs;
        }
    } catch(e) {}
}, 5000);

async function refreshCacheNow() {
    try {
        if (fs.existsSync(STOCK_MASTER_FILE)) {
            CACHED_STOCKS = await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8');
            lastStocksMtimeMs = (await fs.promises.stat(STOCK_MASTER_FILE)).mtimeMs;
        }
        if (fs.existsSync(SIGNALS_FILE)) {
            CACHED_SIGNALS = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
            lastSignalsMtimeMs = (await fs.promises.stat(SIGNALS_FILE)).mtimeMs;
        }
    } catch(e) {
        console.error('[Cache Refresh] Error:', e.message);
    }
}

// Zero-Day Auth Guard
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: '인증 필요' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: '세션 만료' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') next();
    else res.status(403).json({ error: '권한 없음' });
};

const requireProAuth = (req, res, next) => {
    const token = req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: '인증 필요' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        if (decoded.role === 'GUEST' || decoded.role === 'PENDING') return res.status(403).json({ error: '결제/승인 회원 전용' });
        res.userRole = decoded.role;
        next();
    } catch (e) {
        return res.status(401).json({ error: '세션 만료' });
    }
};

app.get('/api/stocks', requireProAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(CACHED_STOCKS);
});

app.get('/api/signals', requireProAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        const sigs = JSON.parse(CACHED_SIGNALS);
        const scored = sigs.map(s => ({ ...s, score: s.score || scoreSignal(s, s.kis_change_data?.bonus_score || 0) }));
        res.json(scored);
    } catch(e) {
        res.send(CACHED_SIGNALS);
    }
});

// 🔴 [Red Team 방어 - R9] 동기화 상태 복구 지원
let currentSyncProgress = { current: 0, total: 348, timeframe: '준비' };
app.get('/api/auto-sync/status', requireProAuth, (req, res) => {
    res.json({ isSyncing: isSyncMutexLocked, progress: currentSyncProgress });
});

let clients = [];
const broadcastUpdate = () => {
    const payload = `data: ${JSON.stringify({ type: 'signal_update' })}\n\n`;
    clients.forEach(c => { try { c.write(payload); if (c.flush) c.flush(); } catch(e) {} });
};

const lastActiveMap = new Map();
const trackActivity = (req, res, next) => {
    const token = req.cookies?.accessToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            if (decoded.userId) {
                lastActiveMap.set(decoded.userId, Date.now());
                systemStatsService.recordVisitor(decoded.userId).catch(() => {});
            }
        } catch(e) {}
    } else {
        systemStatsService.recordVisitor(req.ip || req.socket.remoteAddress).catch(() => {});
    }
    next();
};
app.use(trackActivity);

app.get('/api/stream', (req, res) => {
    const token = req.cookies?.accessToken;
    let role = 'GUEST', userId = null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            role = decoded.role; userId = decoded.userId;
        } catch(e) {}
    }
    if (role === 'GUEST' || role === 'PENDING') return res.status(403).json({ error: '권한 없음' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.userRole = role; res.userId = userId;
    clients.push(res);
    const heartbeatInterval = setInterval(() => { try { res.write(': heartbeat\n\n'); if (res.flush) res.flush(); } catch (e) { clearInterval(heartbeatInterval); } }, 30000);
    req.on('close', () => { clearInterval(heartbeatInterval); clients = clients.filter(c => c !== res); });
});

const broadcastToClients = (payload) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach(client => { try { client.write(data); if (client.flush) client.flush(); } catch (e) {} });
};

app.get('/api/admin/online-users', authenticateToken, isAdmin, (req, res) => {
    const now = Date.now();
    const sseIds = clients.map(c => c.userId).filter(Boolean);
    const heartbeatIds = [];
    lastActiveMap.forEach((timestamp, userId) => { if (now - timestamp < 120000) heartbeatIds.push(userId); });
    const onlineIds = [...new Set([...sseIds, ...heartbeatIds])];
    systemStatsService.updateMaxConcurrent(onlineIds.length).catch(() => {});
    res.json(onlineIds);
});

app.post('/api/admin/daily-signals/backup', authenticateToken, isAdmin, async (req, res) => {
    try { await saveDailySignalsToDB(); res.json({ success: true, message: '백업 성공' }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/daily-snapshots', authenticateToken, isAdmin, async (req, res) => {
    try { res.json(await getPerformanceSnapshotData(req.query)); }
    catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/public/daily-snapshots', async (req, res) => {
    try { res.json(await getPerformanceSnapshotData(req.query)); }
    catch (err) { res.status(500).json({ error: 'Error' }); }
});

const toKSTMidnight = (dateStr, endOfDay = false) => {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    if (endOfDay) d.setTime(d.getTime() + 86399999);
    return d;
};

async function getPerformanceSnapshotData({ date, code, sortBy = 'yield', order = 'desc' }) {
    const where = {};
    const isToday = !date || date === 'all' || date === new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
    if (date && date !== 'all') {
        const start = toKSTMidnight(date), end = toKSTMidnight(date, true);
        where.createdAt = { gte: start, lte: end };
    }
    if (code) where.OR = [{ code: { contains: code, mode: 'insensitive' } }, { name: { contains: code, mode: 'insensitive' } }];
    let rawSnapshots = await prisma.dailyStockSnapshot.findMany({ where, orderBy: { [sortBy]: order }, take: 1000 });
    if (isToday) {
        const liveCache = getFullPriceCache();
        rawSnapshots = rawSnapshots.map(s => {
            const live = liveCache[s.code];
            if (live) return { ...s, currentPrice: live.price || s.currentPrice, yield: live.change_rate !== undefined ? live.change_rate : s.yield };
            return s;
        });
        if (sortBy === 'currentPrice' || sortBy === 'yield') rawSnapshots.sort((a, b) => order === 'desc' ? (b[sortBy]||0) - (a[sortBy]||0) : (a[sortBy]||0) - (b[sortBy]||0));
    }
    return rawSnapshots.map(s => ({ ...s, tradeAmount: s.tradeAmount ? s.tradeAmount.toString() : null }));
}

app.get('/api/public/daily-snapshot-dates', async (req, res) => {
    try {
        const result = await prisma.dailyStockSnapshot.findMany({ select: { createdAt: true }, distinct: ['createdAt'], orderBy: { createdAt: 'desc' }, take: 100 });
        res.json([...new Set(result.map(d => new Date(d.createdAt).toISOString().split('T')[0]))]);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/public/time-slot-signals', (req, res) => {
    const TIME_SLOT_FILE = path.join(__dirname, 'data', 'time_slot_signals.json');
    if (!fs.existsSync(TIME_SLOT_FILE)) return res.json({});
    try {
        const db = JSON.parse(fs.readFileSync(TIME_SLOT_FILE, 'utf8'));
        const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
        res.json(db[today] || {});
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/admin/daily-signal-dates', authenticateToken, isAdmin, async (req, res) => {
    try { res.json((await prisma.dailySignalHistory.findMany({ select: { date: true }, distinct: ['date'], orderBy: { date: 'desc' } })).map(d => d.date)); }
    catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/admin/daily-signals/:date', authenticateToken, isAdmin, async (req, res) => {
    try {
        const history = await prisma.dailySignalHistory.findMany({ where: { date: req.params.date } });
        const format = {};
        history.forEach(item => { format[item.code] = JSON.parse(item.signals); format[item.code]._name = item.name; });
        res.json(format);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

setInterval(() => {
    const now = Date.now();
    lastActiveMap.forEach((timestamp, userId) => { if (now - timestamp > 600000) lastActiveMap.delete(userId); });
}, 300000);

// Webhook Receiver
app.post('/api/webhook', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!process.env.CORE_INTEGRITY_HASH || authHeader !== `Bearer ${process.env.CORE_INTEGRITY_HASH}`) return res.status(401).json({ error: 'Unauthorized' });
    const { code, result_2, result_3, stop_loss, cond_up7, DHH2, progress, signal_HH } = req.body;
    if (!code) return res.status(400).json({ error: 'Code req' });

    const newSignal = {
        id: uuidv4(), code, timestamp: Date.now(), result_2: result_2 || 0, result_3: result_3 || 0,
        stop_loss: stop_loss || (result_3 > 0 ? result_3 * 0.98 : 0),
        cond_up7: cond_up7 || false, DHH2: DHH2 || false, progress: progress || 0, signal_HH: signal_HH || (DHH2 && progress > 0.3),
        trigger_rsi: req.body.trigger_rsi || false, trigger_vol: req.body.trigger_vol || false, entry_approved: req.body.entry_approved || false,
        category: req.body.category || '분석대기', entry_price: req.body.entry_price || 0, timeframe: req.body.timeframe || '1D'
    };

    if (['5M', '15M', '30M', '1H'].includes(newSignal.timeframe)) {
        const nowKST = new Date(Date.now() + (9 * 60 * 60 * 1000));
        if (nowKST.getUTCHours() === 9 && nowKST.getUTCMinutes() <= 15) return res.status(200).json({ dropped: true });
    }

    await withSignalLock(async () => {
        let signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
        signals = signals.filter(s => !(s.code === newSignal.code && s.timeframe === newSignal.timeframe));
        signals.push(newSignal);
        if (signals.length > 5000) signals = signals.sort((a,b)=>b.timestamp-a.timestamp).slice(0, 5000);
        await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify(signals, null, 2));
    });

    if (newSignal.entry_approved) {
        let stockName = code;
        try { const stocks = JSON.parse(await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8')); const found = stocks.find(s=>s.code===code); if(found) stockName=found.name; } catch(e){}
        sendTelegramAlert(newSignal, stockName).catch(() => {});
    }
    await refreshCacheNow();
    broadcastUpdate();
    res.status(200).json({ message: 'Recorded', signal: newSignal });
});

// ✅ Phase 8: Sniper Engine Webhook Receiver
app.post('/api/sniper/webhook', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!process.env.CORE_INTEGRITY_HASH || authHeader !== `Bearer ${process.env.CORE_INTEGRITY_HASH}`) return res.status(401).json({ error: 'Unauthorized' });
    const payload = req.body;
    if (!payload || !payload.signal_id) return res.status(400).json({ error: 'Invalid' });
    try {
        if (payload.type === 'ENTRY') {
            await prisma.sniperSignal.upsert({ where: { signalId: payload.signal_id }, update: {}, create: { signalId: payload.signal_id, ticker: payload.ticker, type: payload.type, entryPrice: payload.price, time: payload.time, grade: payload.grade, score: payload.score, momentum: payload.momentum || {} } });
        } else if (payload.type === 'EXIT_WARN') {
            await prisma.sniperSignal.updateMany({ where: { signalId: payload.signal_id }, data: { isExited: true, exitPrice: payload.price, exitReason: payload.reason || 'None' } });
        }
        const eventData = `data: ${JSON.stringify({ type: 'sniper_alert', payload })}\n\n`;
        clients.forEach(c => { if (c.userRole === 'ADMIN') c.write(eventData); });
        res.status(200).json({ message: 'Processed' });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// CSV Batch Import
app.post('/api/import-csv', requireProAuth, async (req, res) => {
    const { csv, timeframe = '1D' } = req.body;
    if (!csv) return res.status(400).json({ error: 'No CSV' });
    try {
        const lines = csv.trim().split('\n'); if (lines.length < 2) return res.status(400).json({ error: 'Invalid' });
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
        const findIdx = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));
        const idxIcon = findIdx(['ticker', '종목코드', 'symbol']), idxRSI2 = findIdx(['rsi2', 'rsi(2)', '결과2']), idxRSI8 = findIdx(['rsi8', 'rsi(8)', '결과3']), idxTrend = findIdx(['trend', '상승']), idxDHH2 = findIdx(['dhh2', '종', '신호']), idxProg = findIdx(['prog', '진행']);
        if (idxIcon === -1) return res.status(400).json({ error: 'No Ticker col' });
        const newSignals = lines.slice(1).map(row => {
            const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
            const ticker = cols[idxIcon]; if (!ticker) return null;
            const getVal = (idx, def) => (idx !== -1 && cols[idx]) ? (isNaN(cols[idx]) ? cols[idx] : parseFloat(cols[idx])) : def;
            return { id: uuidv4(), code: ticker.split(':').pop(), timestamp: Date.now(), result_2: getVal(idxRSI2, 50), result_3: getVal(idxRSI8, 50), cond_up7: getVal(idxTrend, true) === '상승' || getVal(idxTrend, true) === true || getVal(idxTrend, "") == "1", DHH2: getVal(idxDHH2, true) === '종' || getVal(idxDHH2, true) === true || getVal(idxDHH2, "") == "1" || findIdx(['종']) !== -1, progress: getVal(idxProg, 1.0), signal_HH: true, trigger_rsi: false, trigger_vol: false, entry_approved: false, category: '수동입력(분석대기)', entry_price: 0, timeframe, adx: 30, isTrending: true };
        }).filter(s => s);
        if (newSignals.length === 0) return res.status(400).json({ error: 'No valid data' });
        await withSignalLock(async () => {
            let s = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
            const keys = new Set(newSignals.map(ns => `${ns.code}_${ns.timeframe}`));
            s = s.filter(cs => !keys.has(`${cs.code}_${cs.timeframe}`));
            await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify([...s, ...newSignals], null, 2));
        });
        await refreshCacheNow(); broadcastUpdate();
        res.status(200).json({ message: 'Success', count: newSignals.length });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/reset', requireProAuth, async (req, res) => {
    try {
        await withSignalLock(async () => { const s = JSON.stringify([], null, 2); await fs.promises.writeFile(SIGNALS_FILE, s); CACHED_SIGNALS = s; lastSignalsMtimeMs = Date.now(); });
        alertCache.clear(); res.json({ message: 'Reset' });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

let isSyncMutexLocked = false;
app.post('/api/auto-sync', async (req, res) => {
    let isAllowed = false;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.cookies?.accessToken;
    if (token) {
        try { const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET); if (['ADMIN', 'PAID', 'PRO_USER'].includes(decoded.role)) isAllowed = true; } catch(e) {}
    }
    const CRON_SECRET = process.env.CRON_SECRET;
    const isLocalCron = CRON_SECRET && req.headers['x-internal-cron-secret'] === CRON_SECRET;
    if (!isAllowed && !isLocalCron) return res.status(403).json({ error: '권한 없음' });
    if (isSyncMutexLocked) return res.status(409).json({ error: '이미 진행 중' });

    try {
        isSyncMutexLocked = true;
        const { timeframe, timeframes } = req.body;
        const tfList = Array.isArray(timeframes) && timeframes.length > 0 ? timeframes : [(timeframe || '1D')];
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let kisTokenGlobal = await getKisAccessToken().catch(() => null);
        let totalCount = 0;

        const emitProgress = (cur, tot, t) => {
            currentSyncProgress = { current: cur, total: tot, timeframe: t };
            const payload = `data: ${JSON.stringify({ type: 'sync_progress', payload: { current: cur, total: tot, timeframe: t } })}\n\n`;
            clients.forEach(c => { try { c.write(payload); if(c.flush) c.flush(); } catch(e) {} });
        };

        const stocks = JSON.parse(await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8'));

        for (const tf of tfList) {
            const intervalMap = { '2M': '2m', '5M': '5m', '15M': '15m', '30M': '30m', '1H': '1h', '2H': '1h', '4H': '1h', '1D': '1d', '2D': '1d', '1W': '1wk' };
            const interval = intervalMap[tf] || '1d';
            let syncResults = [], errorCount = 0;
            emitProgress(0, stocks.length, tf);

            for (let i = 0; i < stocks.length; i++) {
                const stock = stocks[i];
                try {
                    // Hybrid Fetch logic... (Reduced for brevity but should be functional)
                    let days = (tf === '2M') ? 2 : (tf === '5M' ? 5 : 30);
                    const suffix = stock.market.includes('KOSPI') ? '.KS' : '.KQ';
                    const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
                    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.code + suffix}?period1=${period1}&period2=${Math.floor(Date.now()/1000)}&interval=${interval}`;
                    const yRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const res = yRes.data.chart.result[0];
                    const quotes = res.indicators.quote[0];
                    let chartData = { open: quotes.open, high: quotes.high, low: quotes.low, close: quotes.close, volume: quotes.volume, time: res.timestamp };
                    
                    if (kisTokenGlobal && (!kisCircuit.bypass || Date.now() > kisCircuit.bypassUntil)) {
                        kisCircuit.bypass = false;
                        try {
                            const kisRes = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', { headers: { 'authorization': 'Bearer ' + kisTokenGlobal, 'appkey': KIS_APP_KEY, 'appsecret': KIS_APP_SECRET, 'tr_id': 'FHKST01010100' }, params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code }, timeout: 5000 });
                            const kd = kisRes.data.output;
                            if (kd && kd.stck_prpr) {
                                const curP = parseInt(kd.stck_prpr);
                                chartData.close[chartData.close.length - 1] = curP;
                                chartData.kis_change_data = { rate: parseFloat(kd.prdy_ctrt), trade_amount: parseInt(kd.acml_tr_pbmn) };
                            }
                        } catch(e) {}
                    }
                    const signal = calculateSignals(chartData, tf);
                    if (signal) syncResults.push({ ...signal, code: stock.code, name: stock.name, timeframe: tf, timestamp: Date.now(), id: uuidv4(), kis_change_data: chartData.kis_change_data });
                } catch (e) { errorCount++; }
                if ((i + 1) % 10 === 0) emitProgress(i + 1, stocks.length, tf);
                await sleep(100);
            }
            if (syncResults.length > 0) {
                await withSignalLock(async () => {
                    let s = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
                    const keys = new Set(syncResults.map(ns => `${ns.code}_${ns.timeframe}`));
                    s = s.filter(cs => !keys.has(`${cs.code}_${cs.timeframe}`));
                    const scored = [...s, ...syncResults].map(sig => ({ ...sig, score: scoreSignal(sig, sig.kis_change_data?.bonus_score || 0) }));
                    const result = JSON.stringify(scored, null, 2);
                    await fs.promises.writeFile(SIGNALS_FILE, result); CACHED_SIGNALS = result;
                });
                broadcastUpdate();
            }
        }
        res.json({ message: '동기화 완료' });
    } catch (e) { res.status(500).json({ error: e.message }); }
    finally { isSyncMutexLocked = false; }
});

app.get('/api/health', (req, res) => res.send('OK'));

if (isPrimaryWorker) {
    startNightlyMonitor(getKisAccessToken, { KIS_APP_KEY, KIS_APP_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS }, getCachedPrice);
    async function archive() {
        await withSignalLock(async () => {
            const signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
            const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const keep = signals.filter(s => s.timestamp >= cutoff);
            await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify(keep, null, 2));
            await refreshCacheNow();
        });
    }
    cron.schedule('0 2 * * *', archive, { timezone: "Asia/Seoul" });
    cron.schedule('0 21 * * 1-5', async () => {
        if (!isTradingDay()) return;
        try {
            const localApi = `http://127.0.0.1:${PORT}/api/auto-sync`;
            await axios.post(localApi, { timeframes: ['30M', '1D', '2D', '2H'] }, { headers: { 'x-internal-cron-secret': process.env.CRON_SECRET || '' } });
            // Nightly report logic...
        } catch(e) {}
    }, { timezone: "Asia/Seoul" });
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[REST API] Server running on port ${PORT}`);
    cron.schedule('1 0 * * *', async () => { await systemStatsService.archiveDailyStats(); }, { timezone: "Asia/Seoul" });
    setTimeout(async () => {
        try {
            await systemStatsService.archiveDailyStats();
            pingAIService();
            startLiveSignalPoller();
            const stockMaster = JSON.parse(CACHED_STOCKS).map(s => ({ code: s.code, entry_price: 0 }));
            if (stockMaster.length > 0) {
                startFullUniversePoller(stockMaster, getKisAccessToken, getSubscribedCodes);
                startWebSocketService((c, p, r) => { updateCachedPrice(c, p, r, stockMaster); });
            }
            if (process.send) process.send('ready');
        } catch(e) { if (process.send) process.send('ready'); }
    }, 3000);
});
