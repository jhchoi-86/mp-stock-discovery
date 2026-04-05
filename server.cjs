require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
BigInt.prototype.toJSON = function() { return this.toString() };
const prisma = new PrismaClient(); // [TASK-003] Global instance moved to top

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
const jwt = require('jsonwebtoken'); // [TASK-005] Moved to top
const { v4: uuidv4 } = require('uuid'); // [MP-DEBUG-001] Added missing uuidv4
// const TelegramBot = require('node-telegram-bot-api'); // [MP-DEBUG-002] Disabled pending usage
dns.setDefaultResultOrder('ipv4first');

const { calculateTotalScore } = require('./src/utils/scoreEngine.cjs');

// 플랜 3: 백엔드 무결성 자동 검증 시스템 가동
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

let aiScoringQueue = null;
try {
    const redisClient = require('./platform/infra/redis/client.cjs');
    aiScoringQueue = new Queue('aiScoringQueue', { connection: redisClient });
    console.log('[BullMQ] aiScoringQueue initialized successfully.');
} catch (e) {
    console.warn('[BullMQ] Redis unavailable. AI scoring queue disabled:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3001;

// [MP-DEBUG-003] Platform routers MOVED below middleware for proper CORS/Auth parsing

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

async function getKisAccessToken(force = false) { // [MP-DEBUG-006] Added force parameter
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
        throw new Error("KIS API Keys are missing in .env");
    }

    // Load from file if not in memory
    if (!force && !kisAccessToken && fs.existsSync(KIS_TOKEN_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(KIS_TOKEN_FILE, 'utf8'));
            kisAccessToken = saved.token;
            kisTokenExpiry = saved.expiry;
        } catch (e) {
            console.error("[KIS API] Failed to read token cache file:", e);
        }
    }

    // Reuse token if valid (buffer of 1 hour)
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
// [v6.3.0] Standardized Signal Scoring
const { calculateDisplayScore: scoreSignal, getGrade } = require('./platform/analysis/scoring/scorer.cjs');

const cookieParser = require('cookie-parser');
const authRouter = require('./src/routes/auth.cjs');
const adminRouter = require('./src/routes/admin.cjs');
const usersRouter = require('./src/routes/users.cjs');
const reportRouter = require('./src/routes/report.cjs');
const leadsRouter = require('./src/routes/leads.cjs');
const { router: publicReportsRouter, getLatestReportHandler } = require('./src/routes/publicReports.cjs');

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

// --- Platform 1.0 신규 라우터 연동 (Phase 2 T2-05) [MP-DEBUG-003 MOVED HERE] ---
app.use('/admin-api', require('./platform/interfaces/api_admin/index.cjs'));
app.use('/user-api', require('./platform/interfaces/api_user/index.cjs'));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/send-report', reportRouter);
app.use('/api/v1/leads', leadsRouter);
app.use('/api/reports/daily', publicReportsRouter);

// Forward /api/public/recommendations directly to the handler
app.get('/api/public/recommendations', getLatestReportHandler);

// [NEW] GET /api/public/top5-strategy (PUBLIC ACCESS)
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

// [NEW] GET /api/public/watchlist-strategy
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
    // Return empty but successful to avoid crashes if no watchlist set yet
    res.json({ updatedAt: new Date().toISOString(), stocks: [] });
  }
});

// [v6.1.0] GET /api/public/live-notifications (BANNER FEED)
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
        // Return default/mock if file not yet created to avoid frontend crash
        res.json([
            { message: "[알림] 실시간 매매 신호 엔진 가동 중...", timestamp: new Date().toISOString() }
        ]);
    }
});

const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const LIVE_NOTIFICATIONS_FILE = path.join(DATA_DIR, 'live_notifications.json');

// [v6.1.0] Live Notification Manager (Banner & Telegram)
async function addLiveNotification(message) {
    try {
        let notifications = [];
        if (fs.existsSync(LIVE_NOTIFICATIONS_FILE)) {
            notifications = JSON.parse(fs.readFileSync(LIVE_NOTIFICATIONS_FILE, 'utf8'));
        }
        
        // Add new notification to the beginning
        notifications.unshift({
            message,
            timestamp: new Date().toISOString(),
            id: uuidv4()
        });
        
        // Keep only the last 20 notifications
        notifications = notifications.slice(0, 20);
        
        const tempPath = LIVE_NOTIFICATIONS_FILE + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(notifications, null, 2));
        fs.renameSync(tempPath, LIVE_NOTIFICATIONS_FILE);

        // [v6.1.1] Push to all web clients immediately via SSE
        broadcastToClients({
            type: 'live_notification',
            data: notifications[0]
        });
    } catch (e) {
        console.error('[LiveNotification] Error saving:', e.message);
    }
}

// 🔴 [Red Team 방어 - R2] signals.json 원자적(Atomic) 락 시스템 (v7.7.21)
let isSignalFileLocked = false;

async function withSignalLock(fn) {
    // 큐 제한이 없는 무한 비동기 폴링 대기 구조로 전환 (Deadlock 차단)
    while (isSignalFileLocked) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms 간격으로 빈자리 확인
    }
    
    isSignalFileLocked = true;
    try {
        return await fn();
    } catch (e) {
        console.error('[SignalLock] Error inside locked function:', e.message);
        throw e;
    } finally {
        isSignalFileLocked = false;
    }
}

// [v5.0.0] Live Signal Board Poller Functions
function isKSTTradingHours() {
    const now = new Date(Date.now() + (9 * 60 * 60 * 1000)); // KST
    const day = now.getUTCDay(); // 0=일, 6=토
    if (day === 0 || day === 6) return false; // 주말 제외
    
    const hour = now.getUTCHours();
    const min = now.getUTCMinutes();
    const timeVal = hour * 100 + min;
    
    return timeVal >= 900 && timeVal <= 1540; // 09:00~15:40
}

function startLiveSignalPoller() {
    const { exec } = require('child_process');
    const poller = () => {
        if (!isKSTTradingHours()) return; // ← 개선된 체크
        
        // ... 나머지 로직
        let top5 = [];
        try {
            const latestPath = path.join(__dirname, 'data/vip_logs/latest.json');
            if (fs.existsSync(latestPath)) {
                const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                top5 = (report.stocks || []).slice(0, 5).map(s => s.code);
            }
        } catch (e) { return; }
        if (top5.length === 0) return;

        const codes = top5.join(',');
        const env = { ...process.env, STOCK_FILTER: codes, ADDITIVE_SAVE: 'true' };
        
        console.log(`[SignalPoller] Checking 2M/5M signals for TOP 5: ${codes}`);
        exec(`node analyzer.cjs 2M 5M`, { env }, (err, stdout) => {
            if (err) {
                console.error('[SignalPoller] Analyzer error:', err.message);
                return;
            }
            updateTimeSlotSignals(top5);
        });
    };
    setInterval(poller, 600000);
    poller();
}

function updateTimeSlotSignals(codes) {
    const SIGNALS_FILE = path.join(__dirname, 'data', 'signals.json');
    const TIME_SLOT_FILE = path.join(__dirname, 'data', 'time_slot_signals.json');
    
    if (!fs.existsSync(SIGNALS_FILE)) return;
    
    // [v6.1.1 RedTeam] Atomic Read using Global Lock to prevent R/W collision
    withSignalLock(async () => {
        try {
            const signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
            const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
            
            let db = {};
            if (fs.existsSync(TIME_SLOT_FILE)) {
                try { db = JSON.parse(await fs.promises.readFile(TIME_SLOT_FILE, 'utf8')); } catch(e) {}
            }
            if (!db[today]) db[today] = {};

            const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
            const h = now.getUTCHours();
            const m = now.getUTCMinutes();
            const slotKey = `${h.toString().padStart(2, '0')}:${m < 30 ? '00' : '30'}`;

            // Get Top 5 names from the memory cache or Master (Pre-load for notifications)
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

                // [v6.1.1] Trigger Real-time Alerts on Signal Flipped to TRUE
                const name = stockNames[code] || code;
                if (!prevTf2m && db[today][code][slotKey].tf2m) {
                    const msg = `[Daily 신호] ${name}(${code}) 2분봉 강력 돌파 시그널 발생!`;
                    sendTelegramAlert(sig2m, name);
                    addLiveNotification(msg);
                    console.log(`[Alert] Triggered 2M for ${name}`);
                }
                if (!prevTf5m && db[today][code][slotKey].tf5m) {
                    const msg = `[Daily 신호] ${name}(${code}) 5분봉 추세 강화 시그널 발생!`;
                    sendTelegramAlert(sig5m, name);
                    addLiveNotification(msg);
                    console.log(`[Alert] Triggered 5M for ${name}`);
                }
            });

            const tempPath = TIME_SLOT_FILE + '.tmp';
            await fs.promises.writeFile(tempPath, JSON.stringify(db, null, 2));
            await fs.promises.rename(tempPath, TIME_SLOT_FILE);
            
            console.log(`[SignalPoller] Atomic Update for ${today} ${slotKey} Success`);
        } catch (e) {
            console.error('[SignalPoller] Sync error:', e.message);
        }
    }).catch(lockErr => console.error('[SignalPoller] Lock error:', lockErr.message));
}

// [v6.0.0] Save Daily Signal Board to DB
async function saveDailySignalsToDB() {
    const TIME_SLOT_FILE = path.join(__dirname, 'data', 'time_slot_signals.json');
    if (!fs.existsSync(TIME_SLOT_FILE)) return;

    try {
        const db = JSON.parse(fs.readFileSync(TIME_SLOT_FILE, 'utf8'));
        const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const signalsToday = db[today];

        if (!signalsToday) {
            console.log(`[SignalDB] No signals found for ${today} to archive.`);
            return;
        }

        // Get Top 5 names from the latest report to save along with codes
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
                update: {
                    signals: JSON.stringify(signalsToday[code]),
                    name: stockNames[code] || code
                },
                create: {
                    date: today,
                    code: code,
                    name: stockNames[code] || code,
                    signals: JSON.stringify(signalsToday[code])
                }
            });
        }
        console.log(`[SignalDB] Successfully archived ${codes.length} stocks for ${today}`);
    } catch (err) {
        console.error('[SignalDB] Error saving to DB:', err.message);
        throw err;
    }
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
app.use('/api/backtest', require('./src/routes/backtest.cjs'));

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

// 🔴 [Stability Patch] Immediate startup cache loading to prevent 5s empty window
try {
    if (fs.existsSync(STOCK_MASTER_FILE)) {
        CACHED_STOCKS = fs.readFileSync(STOCK_MASTER_FILE, 'utf8');
        lastStocksMtimeMs = fs.statSync(STOCK_MASTER_FILE).mtimeMs;
    }
    if (fs.existsSync(SIGNALS_FILE)) {
        CACHED_SIGNALS = fs.readFileSync(SIGNALS_FILE, 'utf8');
        lastSignalsMtimeMs = fs.statSync(SIGNALS_FILE).mtimeMs;
    }
    console.log('[Startup] Memory cache pre-loaded successfully.');
} catch(e) {
    console.error('[Startup] Cache pre-load failed:', e.message);
}

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

function refreshCacheNow() {
    try {
        if (fs.existsSync(STOCK_MASTER_FILE)) {
            CACHED_STOCKS = fs.readFileSync(STOCK_MASTER_FILE, 'utf8');
            lastStocksMtimeMs = fs.statSync(STOCK_MASTER_FILE).mtimeMs;
        }
        if (fs.existsSync(SIGNALS_FILE)) {
            CACHED_SIGNALS = fs.readFileSync(SIGNALS_FILE, 'utf8');
            lastSignalsMtimeMs = fs.statSync(SIGNALS_FILE).mtimeMs;
        }
    } catch(e) {
        console.error('[Cache Refresh] Error:', e.message);
    }
}

// Phase 12-2 Zero-Day Patch: Lightweight Auth Guard (No DB Hits)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : req.cookies?.accessToken;
    
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: '세션이 만료되었습니다.' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ error: '권한이 없습니다 (Admin Only)' });
    }
};

const requireProAuth = (req, res, next) => {
    const token = req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    try {
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

// 🔴 [Red Team 방어 - R9] 동기화 상태 복구 지원
let currentSyncProgress = { current: 0, total: 348, timeframe: '준비' };
app.get('/api/auto-sync/status', requireProAuth, (req, res) => {
    res.json({
        isSyncing: isSyncMutexLocked,
        progress: currentSyncProgress
    });
});

// SSE Clients & Heartbeat Activity Tracking
let clients = [];

const broadcastUpdate = () => {
    const payload = `data: ${JSON.stringify({ type: 'signal_update' })}\n\n`;
    clients.forEach(c => {
        try {
            c.write(payload);
            if (c.flush) c.flush();
        } catch(e) {}
    });
};

const lastActiveMap = new Map(); // userId -> lastActiveTimestamp

// 🔴 [Heartbeat Middleware] Track user activity on every request
const trackActivity = (req, res, next) => {
    const token = req.cookies?.accessToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            if (decoded.userId) {
                lastActiveMap.set(decoded.userId, Date.now());
                // Record Unique Visitor (Async)
                systemStatsService.recordVisitor(decoded.userId).catch(() => {});
            }
        } catch(e) {}
    } else {
        // [TASK-008] Secure IP detection using trusted proxy (req.ip)
        const ip = req.ip || req.socket.remoteAddress;
        systemStatsService.recordVisitor(ip).catch(() => {});
    }
    next();
};

app.use(trackActivity);

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

    // [TASK-016] 30s Heartbeat to prevent Nginx timeout (60s)
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
            if (res.flush) res.flush();
        } catch (e) {
            clearInterval(heartbeatInterval);
        }
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeatInterval);
        clients = clients.filter(client => client !== res);
        console.log(`[SSE] Client disconnected. Total clients remaining: ${clients.length}`);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// [SSE] 전역 실시간 브로드캐스트 엔진 (v3.7.6)
// ─────────────────────────────────────────────────────────────────────────
/** 모든 연결된 클라이언트에게 SSE 메시지 전송 */
const broadcastToClients = (payload) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach(client => {
        try {
            client.write(data);
            if (client.flush) client.flush();
        } catch (e) {
            // console.error('[SSE] Broadcast Error:', e.message);
        }
    });
};

// [v3.8.1] Production Stabilized - No Heartbeat Needed
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
    
    const now = Date.now();
    // 1. Get IDs from active SSE connections
    const sseIds = clients.map(c => c.userId).filter(Boolean);
    
    // 2. Get IDs from Heartbeat map (recent activity < 2 min)
    const heartbeatIds = [];
    lastActiveMap.forEach((timestamp, userId) => {
        if (now - timestamp < 120000) { // 2 minutes
            heartbeatIds.push(userId);
        }
    });

    // 3. Return Union
    const onlineIds = [...new Set([...sseIds, ...heartbeatIds])];
    
    // Update Max Concurrent Stat (Async)
    systemStatsService.updateMaxConcurrent(onlineIds.length).catch(() => {});
    
    res.json(onlineIds);
});

// [Admin] 당일 신호 DB 아카이브 수동 트리거 [STEP 5]
app.post('/api/admin/daily-signals/backup', authenticateToken, isAdmin, async (req, res) => {
    try {
        console.log('[Admin] Manual archive trigger received.');
        await saveDailySignalsToDB();
        res.json({ success: true, message: '당일 신호 DB 아카이브가 성공적으로 완료되었습니다.' });
    } catch (err) {
        console.error('[Admin] Manual archive failed:', err.message);
        res.status(500).json({ success: false, error: '아카이브 중 오류가 발생했습니다: ' + err.message });
    }
});

// [Admin] 성과 통계 조회
app.get('/api/admin/daily-snapshots', async (req, res) => {
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            if (decoded.role === 'ADMIN') isAdmin = true;
        } catch(e) {}
    }
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { date, code, sortBy = 'yield', order = 'desc' } = req.query;
    try {
        const snapshots = await getPerformanceSnapshotData({ date, code, sortBy, order });
        res.json(snapshots);
    } catch (err) {
        console.error('Failed to get snapshots:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// [Public] 성과 통계 조회 (Landing Page용 - 누구나 접근 가능)
app.get('/api/public/daily-snapshots', async (req, res) => {
    const { date, code, sortBy = 'yield', order = 'desc' } = req.query;
    try {
        const snapshots = await getPerformanceSnapshotData({ date, code, sortBy, order });
        res.json(snapshots);
    } catch (err) {
        console.error('Failed to get public snapshots:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Helper for performance snapshots
async function getPerformanceSnapshotData({ date, code, sortBy, order }) {
    const where = {};
    const isToday = !date || date === 'all' || date === new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

    if (date && date !== 'all') {
        const start = new Date(date);
        start.setHours(0,0,0,0);
        const end = new Date(date);
        end.setHours(23,59,59,999);
        where.createdAt = { gte: start, lte: end };
    }
    if (code) {
      where.OR = [
        { code: { contains: code, mode: 'insensitive' } },
        { name: { contains: code, mode: 'insensitive' } }
      ];
    }
    
    let rawSnapshots = await prisma.dailyStockSnapshot.findMany({
        where,
        orderBy: { [sortBy]: order },
        take: 1000
    });
    
    // 🟢 [v3.2.5 실시간 연동] 오늘 데이터인 경우 실시간 폴러 캐시 병합
    if (isToday) {
        const liveCache = getFullPriceCache();
        rawSnapshots = rawSnapshots.map(s => {
            const live = liveCache[s.code];
            if (live) {
                return {
                    ...s,
                    currentPrice: live.price || s.currentPrice,
                    yield: live.change_rate !== undefined ? live.change_rate : s.yield
                };
            }
            return s;
        });
        
        // 정렬 기준이 실시간으로 변한 가격/수익률일 경우 다시 정렬 (Prisma 정렬은 DB 값 기준이므로)
        if (sortBy === 'currentPrice' || sortBy === 'yield') {
            rawSnapshots.sort((a, b) => {
                const valA = a[sortBy] || 0;
                const valB = b[sortBy] || 0;
                return order === 'desc' ? valB - valA : valA - valB;
            });
        }
    }
    
    return rawSnapshots.map(s => ({
        ...s,
        tradeAmount: s.tradeAmount ? s.tradeAmount.toString() : null
    }));
}

// [Public/Paid] 성과 통계 날짜 목록
app.get('/api/public/daily-snapshot-dates', async (req, res) => {
    try {
        const result = await prisma.dailyStockSnapshot.findMany({
            select: { createdAt: true },
            distinct: ['createdAt'],
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        const formatted = [...new Set(result.map(d => new Date(d.createdAt).toISOString().split('T')[0]))];
        res.json(formatted);
    } catch (err) {
        console.error('Failed to get snapshot dates:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// [v5.0.0] Time Slot Signal API
app.get('/api/public/time-slot-signals', (req, res) => {
    const TIME_SLOT_FILE = path.join(__dirname, 'data', 'time_slot_signals.json');
    if (!fs.existsSync(TIME_SLOT_FILE)) return res.json({});
    try {
        const db = JSON.parse(fs.readFileSync(TIME_SLOT_FILE, 'utf8'));
        const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
        res.json(db[today] || {});
    } catch (e) {
        res.status(500).json({ error: 'Failed to read signal data' });
    }
});

// [v6.0.0] Admin Signal History APIs
app.get('/api/admin/daily-signal-dates', authenticateToken, isAdmin, async (req, res) => {
    try {
        const dates = await prisma.dailySignalHistory.findMany({
            select: { date: true },
            distinct: ['date'],
            orderBy: { date: 'desc' }
        });
        res.json(dates.map(d => d.date));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history dates' });
    }
});

app.get('/api/admin/daily-signals/:date', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { date } = req.params;
        const history = await prisma.dailySignalHistory.findMany({
            where: { date }
        });
        // Convert to the grid format: { code: { slot: { tf2m, tf5m } } }
        const formatted = {};
        history.forEach(item => {
            formatted[item.code] = JSON.parse(item.signals);
            formatted[item.code]._name = item.name; // Keep name for display
        });
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history data' });
    }
});

// ← [TASK-004] 중복 라우트 제거됨 (위 L771에서 통합, 응답포맷: { success, message })


// Periodic cleanup of lastActiveMap to prevent memory leaks (older than 10 min)
setInterval(() => {
    const now = Date.now();
    lastActiveMap.forEach((timestamp, userId) => {
        if (now - timestamp > 600000) {
            lastActiveMap.delete(userId);
        }
    });
}, 300000); // Every 5 min


// Webhook Receiver
app.post('/api/webhook', async (req, res) => {
    // 🔴 [Red Team 방어 - R8-C] Webhook 무단 주입 방어 (Bearer 인증)
    const authHeader = req.headers['authorization'];
    const expectedSecret = process.env.CORE_INTEGRITY_HASH;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        console.warn(`[SECURITY] 무단 일반 Webhook 접근 차단 (IP: ${req.ip})`);
        return res.status(401).json({ error: 'Unauthorized Webhook Access' });
    }

    const { code, result_2, result_3, stop_loss, cond_up7, DHH2, progress, signal_HH } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Stock code is required' });
    }

    const newSignal = {
        id: uuidv4(),
        code,
        timestamp: Date.now(),
        result_2: result_2 || 0,
        result_3: result_3 || 0,
        stop_loss: stop_loss || (result_3 > 0 ? result_3 * 0.98 : 0), // [v6.6.1] Pine Script Base: Entry2 - 2%
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
        // [MP-DEBUG-MEDIUM-002] Fixed Opening Range Filter (KST 09:00 - 09:15)
        const nowKST = new Date(Date.now() + (9 * 60 * 60 * 1000));
        const hours = nowKST.getUTCHours();
        const minutes = nowKST.getUTCMinutes();
        if (hours === 9 && minutes >= 0 && minutes <= 15) {
            console.log(`[Filter] Blocked signal for ${code} due to Opening Range (09:00-09:15)`);
            return res.status(200).json({ message: 'Signal blocked by Opening Range filter', dropped: true });
        }
    }

    // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
    await withSignalLock(async () => {
        let signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
        
        // 동일 종목+타임프레임 기존 신호 제거 후 새 신호 삽입 (누적 방지) [TASK-020]
        signals = signals.filter(s => !(s.code === newSignal.code && s.timeframe === newSignal.timeframe));
        signals.push(newSignal);

        // 전체 신호 수 상한 (종목수 × TF수 × 2배 여유)
        const MAX_SIGNALS = 5000;
        if (signals.length > MAX_SIGNALS) {
            signals = signals
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, MAX_SIGNALS);
        }
        
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

    refreshCacheNow();
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

        // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용 [MP-DEBUG-HIGH-004] Prevent duplicates
        await withSignalLock(async () => {
            let signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
            const newKeys = new Set(newSignals.map(s => `${s.code}_${s.timeframe}`));
            signals = signals.filter(s => !newKeys.has(`${s.code}_${s.timeframe}`));
            
            const merged = [...signals, ...newSignals];
            await fs.promises.writeFile(SIGNALS_FILE, JSON.stringify(merged, null, 2));
        });

        console.log(`[Batch Import] ${newSignals.length} signals imported via CSV.`);
        refreshCacheNow();
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
            const resultStr = JSON.stringify([], null, 2);
            await fs.promises.writeFile(SIGNALS_FILE, resultStr);
            CACHED_SIGNALS = resultStr; // 즉시 신호 캐시만 갱신
            lastSignalsMtimeMs = Date.now();
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
            // [MP-DEBUG-HIGH-001] Use global jwt object
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            debugRole = decoded.role;
            if (decoded.role === 'ADMIN' || decoded.role === 'PAID' || decoded.role === 'PRO_USER') isAllowed = true;
        } catch(e) {
            console.error('[Auto-Sync] JWT Verify Error:', e.message);
        }
    } else {
        console.error('[Auto-Sync] Missing accessToken cookie in req.cookies!');
    }
    // 🔴 [TASK-003 보안패치] CRON_SECRET 하드코딩 기본값 제거 - 환경변수 필수
    const CRON_SECRET = process.env.CRON_SECRET;
    if (!CRON_SECRET) {
        console.error('[SECURITY] CRON_SECRET is not set in .env! Internal cron will be disabled.');
    }
    const isLocalCron = CRON_SECRET && req.headers['x-internal-cron-secret'] === CRON_SECRET;
    
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
    
    try {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let kisTokenGlobal = null;
        try {
            kisTokenGlobal = await getKisAccessToken();
        } catch(e) {
            console.error("[Auto-Sync] KIS Token failed, falling back to pure Yahoo.");
        }
        
        let totalCount = 0;

        // [v7.7.19] Scope FIX: Move emitProgress OUTSIDE the timeframe loop
        const emitProgress = (cur, tot, t) => {
            currentSyncProgress = { current: cur, total: tot, timeframe: t };
            const payload = `data: ${JSON.stringify({ type: 'sync_progress', payload: { current: cur, total: tot, timeframe: t } })}\n\n`;
            clients.forEach(c => { 
                try { 
                    c.write(payload); 
                    if(c.flush) c.flush();
                } catch(e) {} 
            });
        };

        for (const tf of tfList) {
            const intervalMap = { '2M': '2m', '5M': '5m', '15M': '15m', '30M': '30m', '1H': '1h', '2H': '1h', '4H': '1h', '1D': '1d', '2D': '1d', '1W': '1wk' };
            const interval = intervalMap[tf] || '1d';

            const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE));
            let syncResults = [];
            let errorCount = 0;

            console.log(`[Auto-Sync] Starting sync for ${stocks.length} stocks at ${tf} timeframe...`);
            emitProgress(0, stocks.length, tf);

    // Helper to fetch Hybrid Data (Yahoo history + KIS real-time current price)
    const fetchHybridHistory = async (stock) => {
        // [MP-DEBUG-HIGH-003] Set days for 2M timeframe (Yahoo limits 2M to 60 days)
        if (tf === '2M') days = 2; // Yahoo 2m support is max 60 days, safer with 2 days
        if (tf === '5M') days = 5;
        if (tf === '15M') days = 15;
        if (tf === '30M') days = 30;
        if (tf === '1D' || tf === '2D') days = 365;
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
                    },
                    timeout: 5000 // 🔴 [Red Team 방어] 5초 타임아웃 강제 (Network Hang 방지)
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
                // EGW00123: Expired Token
                if (e.response && e.response.data && e.response.data.msg_cd === 'EGW00123') {
                    throw { type: 'TOKEN_EXPIRED', originalError: e };
                }
                // If it fails, silent fallback to yahoo's tail
                if (e.response && e.response.status === 429) {
                    console.error(`[KIS API Rate Limit] ${stock.code} fell back to Yahoo`);
                } else {
                    console.error(`[KIS API Silent Crash] ${stock.code}:`, e.message, e.response?.data || '');
                }
            }
        }

        if (tf === '2M') chartData = resampleChartData(chartData, 2, tf);
        if (tf === '2H') chartData = resampleChartData(chartData, 2, tf);
        if (tf === '4H') chartData = resampleChartData(chartData, 4, tf);
        if (tf === '2D') chartData = resampleChartData(chartData, 2, tf);

        return chartData;
    };

    const resampleChartData = (raw, hourCount, targetTf) => {
        let resampled = { open: [], high: [], low: [], close: [], volume: [], time: [] };
        if (!raw.time || raw.time.length === 0) return resampled;
        const isDayBased = (targetTf === '2D');

        let currentCandle = null;
        let candleCount = 0;
        let currentDayStr = null;

        for (let i = 0; i < raw.time.length; i++) {
            const date = new Date(raw.time[i] * 1000);
            date.setUTCHours(date.getUTCHours() + 9);
            const dayStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

            if (!isDayBased && currentDayStr !== dayStr) {
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
                if (e.type === 'TOKEN_EXPIRED') {
                    console.log(`[Auto-Sync] Token expired during ${stock.code}. Refreshing...`);
                    kisTokenGlobal = await getKisAccessToken(true); // Force Refresh
                    // Retry once
                    try {
                        const historyRetry = await fetchHybridHistory(stock);
                        if (historyRetry && historyRetry.close && historyRetry.close.length > 50) {
                            const signal = calculateSignals(historyRetry, tf);
                            if (signal) {
                                syncResults.push({ ...signal, code: stock.code, name: stock.name, timeframe: tf, timestamp: Date.now(), id: uuidv4(), kis_change_data: historyRetry.kis_change_data });
                            }
                        }
                    } catch(retryErr) {
                        console.error(`[Auto-Sync] Retry Error for ${stock.code}:`, retryErr.message);
                        errorCount++;
                    }
                } else {
                    console.error(`[Auto-Sync] Error for ${stock.code} (${stock.name}):`, e.message);
                    errorCount++;
                }
            }
        
        if (i > 0 && i % 50 === 0) {
            console.log(`[Auto-Sync] Processed ${i}/${stocks.length} stocks...`);
        }
        
        // Emit progress to clients every 10 stocks
        if ((i + 1) % 10 === 0) emitProgress(i + 1, stocks.length, tf);

        // [TASK-009] 타임프레임별 슬립 최적화: 분봉(곻서 100ms), 시간봉 150ms, 일봉/주봉 200ms
        const getSleepTime = (tf) => {
            if (['2M', '5M', '15M', '30M'].includes(tf)) return 100;
            if (['1D', '2D', '1W'].includes(tf)) return 200;
            return 150;
        };
        await sleep(getSleepTime(tf));
    }

    emitProgress(stocks.length, stocks.length, tf);

    if (syncResults.length > 0) {
        // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
        await withSignalLock(async () => {
            let currentSignals = [];
            try {
                const rawData = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
                currentSignals = JSON.parse(rawData);
            } catch (parseErr) {
                console.error('[Auto-Sync] signals.json parse error, using empty array:', parseErr.message);
                currentSignals = [];
            }
            
            // Remove old signals for the matching code and timeframe
            const syncCodes = new Set(syncResults.map(s => s.code));
            currentSignals = currentSignals.filter(s => !(syncCodes.has(s.code) && s.timeframe === tf));

            const merged = [...currentSignals, ...syncResults];
            const resultStr = JSON.stringify(merged, null, 2);
            await fs.promises.writeFile(SIGNALS_FILE, resultStr);
            CACHED_SIGNALS = resultStr; // 즉시 캐시 갱신
            lastSignalsMtimeMs = Date.now();
        });
        broadcastUpdate();

        console.log(`[Auto-Sync] Completed timeframe ${tf}. Success: ${syncResults.length}, Errors: ${errorCount}`);
        totalCount += syncResults.length;
        } // v7.7.13 FIX
    } // End of tfList loop

    // [MP-DEBUG-HIGH-006] Bulk Sync Success Notification
    emitProgress(currentSyncProgress.total, currentSyncProgress.total, "전체완료");


    // --- NEW: Final Persistence after ALL timeframes (v7.7.12) ---
    try {
        console.log(`[Auto-Sync] ALL timeframes complete. Finalizing persistence to DB and latest.json...`);
        const stocksMap = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE));
        const currentSignalsRaw = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
        const currentSignals = JSON.parse(currentSignalsRaw);
        
        const getSignalsForStock = (code) => {
            const stockSignals = currentSignals.filter(s => s.code === code); // [MP-DEBUG-MEDIUM-003] Added code filter
            const status = {};
            ["30M", "1H", "2H", "4H", "1D", "2D", "1W"].forEach(targetTf => {
                status[targetTf] = stockSignals.find(s => s.timeframe === targetTf);
            });
            return status;
        };

        const snapshotData = stocksMap.map(stock => {
            const tfSigs = getSignalsForStock(stock.code);
            const sig2H = tfSigs['2H'];
            const latest = Object.values(tfSigs).filter(s => s).sort((a,b)=>b.timestamp-a.timestamp)[0];
            
            if (!latest) return null;

            const { score } = calculateTotalScore(tfSigs, latest);
            
            return {
                code: stock.code,
                name: stock.name,
                category: score >= 80 ? '추천종목' : '스나이퍼 포착',
                score: score,
                adx: latest?.adx || 0,
                currentPrice: latest?.current_price || latest?.entry_price || 0,
                entryPrice1: sig2H?.result_2 || 0,
                entryPrice2: sig2H?.result_3 || 0,
                targetPrice1: sig2H?.bb_upper || 0,
                targetPrice2: Math.round((sig2H?.bb_upper || 0) * 1.05),
                stopLoss: sig2H?.stop_loss || 0,
                ema5: sig2H?.ema5 || 0,
                ema10: sig2H?.ema10 || 0,
                ema20: sig2H?.ema20 || 0,
                ema60: sig2H?.ema60 || 0,
                yield: latest?.kis_change_data?.rate || 0,
                tradeAmount: latest?.kis_change_data?.trade_amount ? BigInt(latest.kis_change_data.trade_amount) : 0n,
                foreignBuy: String(latest?.kis_change_data?.foreign_buy || '-'),
                instBuy: String(latest?.kis_change_data?.inst_buy || '-')
            };
        }).filter(s => s && s.score > 0);

        if (snapshotData.length > 0) {
            // [MP-DEBUG-HIGH-002] skipDuplicates to avoid DB errors on repeated runs
            await prisma.dailyStockSnapshot.createMany({ data: snapshotData, skipDuplicates: true });
            console.log(`[Auto-Sync] Final Persisted ${snapshotData.length} snapshots to DB.`);

            const VIP_LOGS_DIR = path.join(__dirname, 'data/vip_logs');
            if (!fs.existsSync(VIP_LOGS_DIR)) fs.mkdirSync(VIP_LOGS_DIR, { recursive: true });
            
            const reportStocks = snapshotData.slice(0, 10).map(s => ({
                code: s.code,
                name: s.name,
                status: '분석완료',
                execution_time: new Date().toISOString(),
                current_price: s.currentPrice,
                yield_pct: s.yield,
                is_legacy: false,
                score: s.score,
                stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
                entry_price: s.entryPrice1,
                entry_price_2: s.entryPrice2,
                stop_loss: s.stopLoss,
                target_price_exit: s.targetPrice1,
                recommended_at: new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + '.'
            }));

            const payload = {
                stocks: reportStocks,
                summary: { hit_rate: "100%", avg_yield: "+0.0%", portfolio_size: reportStocks.length },
                header: {
                    report_date: "핵심 정보 통합 리포트 (최적화 v7.7.12)",
                    universe: "MP 통합 포트폴리오 (Live)",
                    source: "Optimized Sync v7.7.12"
                },
                note: "본 리포트는 모든 분석 완료 후 최종 산출된 최적화 결과입니다."
            };
            fs.writeFileSync(path.join(VIP_LOGS_DIR, 'latest.json'), JSON.stringify(payload, null, 2));
            console.log(`[Auto-Sync] Final Updated latest.json with Top 10 stocks.`);
        }
    } catch (finalErr) {
        console.error('[Auto-Sync Final Persistence Error]', finalErr.message);
    }

    console.log(`[Auto-Sync] All requested timeframes completed.`);
    res.json({ message: '동기화 완료', count: totalCount });
} catch (globalErr) {
    console.error('[Auto-Sync Error]', globalErr);
    if (!res.headersSent) res.status(500).json({ error: globalErr.message });
} finally {
    isSyncMutexLocked = false;
    const finalPayload = `data: ${JSON.stringify({ type: 'sync_complete' })}\n\n`;
    clients.forEach(c => { try { c.write(finalPayload); if (c.flush) c.flush(); } catch(e) {} });
}
});

// 🔴 [Red Team 방어 - R6] AWS PM2 롤백 스크립트를 위한 헬스체크 도입
app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
});


// 🔴 [Red Team 방어 - R4] AI 엔진 지연시간 해소 (Cron 루프 외부 1회성 로드)
const pingAIService = () => {
    axios.get('http://127.0.0.1:8000/health', { timeout: 3000 })
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
    }, getCachedPrice); // [v6.2.5] Injecting cache provider

    async function archiveOldSignals() {
        console.log('[Archive] Starting old signals cleanup...');
        const retentionDays = parseInt(process.env.SIGNAL_RETENTION_DAYS || '7');
        const archiveRetentionDays = parseInt(process.env.ARCHIVE_RETENTION_DAYS || '90');
        const maxFiles = 90;
        
        const archiveDir = path.join(__dirname, 'data', 'archive'); // [TASK-010] 상단으로 호이스팅 - 중복선언 제거
        await withSignalLock(async () => {
            const raw = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
            const signals = JSON.parse(raw);
            const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            
            const toKeep = signals.filter(s => s.timestamp >= cutoffTime);
            const toArchive = signals.filter(s => s.timestamp < cutoffTime);
            
            if (toArchive.length > 0) {
                // archiveDir 이미 선언됨 - const 제거
                if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
                
                const d = new Date();
                const pad = n => n.toString().padStart(2, '0');
                const dateStr = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
                const archFile = path.join(archiveDir, `signals_${dateStr}.json`);
                
                let existing = [];
                if (fs.existsSync(archFile)) existing = JSON.parse(await fs.promises.readFile(archFile, 'utf8'));
                await fs.promises.writeFile(archFile, JSON.stringify([...existing, ...toArchive], null, 2));
                
                const tmpFile = SIGNALS_FILE + '.tmp';
                try {
                    await fs.promises.writeFile(tmpFile, JSON.stringify(toKeep, null, 2));
                    await fs.promises.rename(tmpFile, SIGNALS_FILE);
                } catch (writeErr) {
                    // [MP-DEBUG-MEDIUM-004] Clean up .tmp on failure
                    fs.promises.unlink(tmpFile).catch(() => {});
                    throw writeErr;
                }
                
                console.log(`[Archive] Archived ${toArchive.length} signals. Remaining: ${toKeep.length}.`);
                refreshCacheNow();
            }
            
            // [TASK-010] Clean up old archives - archiveDir 이미 선언됨
            if (fs.existsSync(archiveDir)) {
                let files = fs.readdirSync(archiveDir).filter(f => f.startsWith('signals_'));
                const fileCutoff = Date.now() - (archiveRetentionDays * 24 * 60 * 60 * 1000);
                
                files = files.filter(f => {
                    const stats = fs.statSync(path.join(archiveDir, f));
                    if (stats.mtimeMs < fileCutoff) {
                        // [TASK-015] filter 내부는 async 불가 → 동기 unlinkSync 사용
                        try { fs.unlinkSync(path.join(archiveDir, f)); } catch(e) {}
                        return false;
                    }
                    return true;
                });
                
                if (files.length > maxFiles) {
                    files.sort();
                    const toDelete = files.slice(0, files.length - maxFiles);
                    // [TASK-015] forEach → for...of + await 사용쿼서 비동기 안전성 확보
                    for (const f of toDelete) {
                        await fs.promises.unlink(path.join(archiveDir, f)).catch(() => {});
                    }
                }
            }
        });
    }

    // [v7.4.1] Morning Cron Removed per user request. Retaining Holiday Logic.
    const isTradingDay = () => {
        const now = new Date();
        const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const day = kst.getUTCDay();
        if (day === 0 || day === 6) return false; // 토/일 제외

        // [TASK-016] 연도별 공휴일 DB - 2027년까지 준비
        const holidaysByYear = {
            2026: ["2026-01-01","2026-02-16","2026-02-17","2026-02-18","2026-03-01",
                   "2026-05-05","2026-05-24","2026-06-06","2026-08-15","2026-09-24",
                   "2026-09-25","2026-09-26","2026-10-03","2026-10-09","2026-12-25"],
            2027: ["2027-01-01","2027-01-27","2027-01-28","2027-01-29","2027-03-01",
                   "2027-05-05","2027-05-13","2027-06-06","2027-08-15","2027-09-14",
                   "2027-09-15","2027-09-16","2027-10-03","2027-10-09","2027-12-25"]
        };
        // [MP-DEBUG-HIGH-005] Correct KST day calculation
        const year = kst.getUTCFullYear();
        const holidays = holidaysByYear[year] || [];
        const dateStr = `${year}-${(kst.getUTCMonth()+1).toString().padStart(2,'0')}-${kst.getUTCDate().toString().padStart(2,'0')}`;
        return !holidays.includes(dateStr);
    };

    cron.schedule(process.env.ARCHIVE_CRON_TIME || '0 2 * * *', () => archiveOldSignals());

    cron.schedule('0 21 * * 1-5', async () => {
        if (!isTradingDay()) {
            console.log('[Cron] Today is a holiday. Skipping 21:00 batch.');
            return;
        }
        console.log('[Cron] 자동 종목 발굴 및 텔레그램 발송 시작...');
        try {
            const now = new Date();
            now.setUTCHours(now.getUTCHours() + 9);
            const dateStr = `${now.getUTCFullYear()}-${(now.getUTCMonth()+1).toString().padStart(2,'0')}-${now.getUTCDate().toString().padStart(2,'0')}`;
            
            const LOCK_FILE = path.join(__dirname, 'data', 'last_sent_date.json');
            if (fs.existsSync(LOCK_FILE)) {
                const lastDate = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')).date;
                if (lastDate === dateStr) {
                    console.log(`[Cron] Today's report already sent (${dateStr}). Skipping.`);
                    return;
                }
            }

            const localApi = `http://127.0.0.1:${PORT}/api/auto-sync`;
            console.log('[Cron] 30M, 1D, 2D, 2H 일괄 동기화 시작...');
            await axios.post(localApi, { timeframes: ['30M', '1D', '2D', '2H'] }, {
                headers: { 'x-internal-cron-secret': process.env.CRON_SECRET || '' }
            });

            const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
            const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));

            const getSignalsForStock = (code) => {
              const stockSignals = signals.filter(s => s.code === code);
              const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "2D", "1W"];
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
              
              const { score } = calculateTotalScore(tfSigs, latest);
              return { ...stock, timeframeStatus: tfSigs, latestSignal: latest, total_score: score };
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

            // [MP-DEBUG-HIGH-005/MEDIUM-001] Safe KST Date handling
            const isFriday = now.getUTCDay() === 5;
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const isEndOfMonth = tomorrow.getUTCMonth() !== now.getUTCMonth();

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
                  { timeout: 30000 } // 🔴 [Red Team 방어] 10개 이상 종목 분석 대비 30초로 증설 (기존 25초)
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
                              `손절가 (SL): ${(() => {
                                    const sl = sig2H?.stop_loss || (sig2H?.result_3 > 0 ? sig2H.result_3 * 0.98 : 0);
                                    return sl > 0 ? Math.round(sl).toLocaleString() : '-';
                                  })()}원 ${formatGap(sig2H.result_2)}\n` +
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

            // --- [v6.0.0] Save Daily Signal Board to DB ---
            try {
              console.log('[Cron] Archiving Daily Signal Board to DB...');
              await saveDailySignalsToDB();
            } catch (sigStoreErr) {
              console.error('[Cron] Signal Archiving Error:', sigStoreErr.message);
            }

            // --- Phase 13: Full Universe Persistence to DailyStockSnapshot ---
            console.log(`[Cron] Persisting ${candidates.length} performance snapshots to DB...`);
            try {
                const snapshotData = candidates.map(s => {
                    const sig2H = s.timeframeStatus['2H'];
                    return {
                        code: s.code,
                        name: s.name,
                        category: s.total_score >= 80 ? '추천종목' : '스나이퍼 포착',
                        score: s.total_score,
                        adx: s.latestSignal?.adx || 0,
                        currentPrice: s.latestSignal?.current_price || s.latestSignal?.entry_price || 0,
                        entryPrice1: sig2H?.result_2 || 0,
                        entryPrice2: sig2H?.result_3 || 0,
                        targetPrice1: sig2H?.bb_upper || 0,
                        targetPrice2: Math.round((sig2H?.bb_upper || 0) * 1.05),
                        stopLoss: sig2H?.stop_loss || 0,
                        ema5: sig2H?.ema5 || 0,
                        ema10: sig2H?.ema10 || 0,
                        ema20: sig2H?.ema20 || 0,
                        ema60: sig2H?.ema60 || 0,
                        yield: s.latestSignal?.kis_change_data?.rate || 0,
                        tradeAmount: s.latestSignal?.kis_change_data?.trade_amount ? BigInt(s.latestSignal.kis_change_data.trade_amount) : 0n,
                        foreignBuy: String(s.latestSignal?.kis_change_data?.foreign_buy || '-'),
                        instBuy: String(s.latestSignal?.kis_change_data?.inst_buy || '-')
                    };
                });
                
                // [MP-DEBUG-HIGH-002] skipDuplicates added
                await prisma.dailyStockSnapshot.createMany({ data: snapshotData, skipDuplicates: true });
                console.log(`[Cron] Successfully persisted ${snapshotData.length} records to DB.`);
            } catch (snapErr) {
                console.error('[Cron] Snapshot Persistence Error:', snapErr);
            }

            // [MP-DEBUG-LOW-001] Split long content for Telegram (Max 4096 chars)
            const MAX_TG_LENGTH = 4000;
            const chunks = [];
            let remaining = content;
            while (remaining.length > 0) {
                chunks.push(remaining.substring(0, MAX_TG_LENGTH));
                remaining = remaining.substring(MAX_TG_LENGTH);
            }

            for (const chatId of TELEGRAM_CHAT_IDS) {
                for (const chunk of chunks) {
                    try {
                        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
                        await axios.post(url, { chat_id: chatId, text: chunk }, { httpsAgent: new https.Agent({ family: 4 }) });
                        if (chunks.length > 1) await new Promise(r => setTimeout(r, 300));
                    } catch (e) { console.error(`[Telegram] 발송 실패 (${chatId}):`, e.message); }
                }
            }
            console.log(`[Cron] 성공적으로 텔레그램에 야간 리포트를 전송했습니다.`);

            // [v3.7.3] Persist last sent date to prevent duplicates on restart
            try {
                const LOCK_FILE = path.join(__dirname, 'data', 'last_sent_date.json');
                fs.writeFileSync(LOCK_FILE, JSON.stringify({ date: dateStr }, null, 2));
            } catch (e) { console.error('[Lock Error] Failed to write lock file:', e.message); }
            
            // Save Nightly cron alert to DB
            try {
              const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
              if (adminUser) {
                  await prisma.report.create({
                      data: { content: content, authorId: adminUser.id }
                  });
                  console.log(`[Cron] Saved Nightly Report to VIP DB`);
              }
            } catch(dbErr) {
                console.error('[Cron DB Error]', dbErr);
            }

            // --- [v3.9.5 Automation] Update Landing Strategy & Send Telegram Report ---
            const { exec } = require('child_process'); // [TASK-007] Use async exec
            try {
                console.log('[Cron] Updating landing page strategy data...');
                const updatePath = path.join(__dirname, 'scripts', 'update_landing_strategy.cjs');
                await new Promise((resolve) => {
                    exec(`node "${updatePath}"`, (err) => {
                        if (err) console.error('[Cron] update_landing_strategy error:', err.message);
                        resolve();
                    });
                });
                
                console.log('[Cron] Sending High-Value Telegram report...');
                const reportPath = path.join(__dirname, 'scripts', 'send_top5_report.cjs');
                await new Promise((resolve) => {
                    exec(`node "${reportPath}"`, (err) => {
                        if (err) console.error('[Cron] send_top5_report error:', err.message);
                        resolve();
                    });
                });
            } catch (execErr) {
                console.error('[Cron Automation Error]', execErr.message);
            }

        } catch(e) {
            console.error('[Cron Error] 야간 자동 발송 중 오류 발생:', e);
        }
    }, { timezone: "Asia/Seoul" });
}

// ==========================================
// Phase 5: Ensure the server binds to the port and signals PM2
// ==========================================
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[REST API] Server is successfully running on port ${PORT}`);

    // 1. 크론잡 등록 (가벼운 작업)
    cron.schedule('1 0 * * *', async () => {
        console.log('[Cron] Archiving Daily System Stats...');
        await systemStatsService.archiveDailyStats();
    }, { timezone: "Asia/Seoul" });
    
    const { exec } = require('child_process');
    const runReportGenerator = () => {
        const scriptPath = path.join(__dirname, 'scripts', 'generateReport.cjs');
        exec(`node "${scriptPath}"`, (error, stdout) => {
            if (error) console.error(`[Cron Error] ${error.message}`);
            else console.log(`[ReportGen Output] ${stdout}`);
        });
    };

    // 2. 백그라운드 초기화 (무거운 작업)
    setTimeout(async () => {
        try {
            console.log('[Init] Starting heavy background initialization...');
            await systemStatsService.archiveDailyStats();
            
            // Initial AI Engine Warmup
            pingAIService();
            
            // Live Signal Poller
            startLiveSignalPoller();
            
            // Full Universe Poller & WebSocket
            const stockMasterStr = CACHED_STOCKS;
            const stockMaster = JSON.parse(stockMasterStr).map(s => ({
                code:        s.code,
                entry_price: 0
            }));
            
            if (stockMaster.length > 0) {
                startFullUniversePoller(stockMaster, getKisAccessToken, getSubscribedCodes);
                
                // WebSocket Setup
                try {
                    const getPriorityCodes = () => {
                        try {
                            const latestPath = path.join(__dirname, 'data/vip_logs/latest.json');
                            if (fs.existsSync(latestPath)) {
                                const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                                return (report.stocks || []).map(s => s.code);
                            }
                        } catch (e) {}
                        return [];
                    };

                    const priceBuffer = {};
                    setInterval(() => {
                        if (Object.keys(priceBuffer).length > 0) {
                            broadcastToClients({ type: 'price_snapshot', data: { ...priceBuffer } });
                            Object.keys(priceBuffer).forEach(key => delete priceBuffer[key]);
                        }
                    }, 200);

                    startWebSocketService((c, p, r) => {
                        updateCachedPrice(c, p, r, stockMaster);
                        priceBuffer[c] = { price: p, changeRate: r };
                    });
                    
                    const refreshStats = async () => {
                        const reportCodes = getPriorityCodes();
                        const extraCount = 40 - reportCodes.length;
                        const extras = stockMaster
                            .filter(s => !reportCodes.includes(s.code))
                            .slice(0, Math.max(0, extraCount))
                            .map(s => s.code);
                        
                        const targets = [...reportCodes, ...extras];
                        await updateSubscriptions(targets);
                    };

                    refreshStats();
                    setInterval(refreshStats, 5 * 60 * 1000);
                } catch(wsErr) { console.error('[WSS] Error:', wsErr.message); }
            }

            // 3. 모든 초기화 완료 후 PM2 ready 신호 발행 [TASK-023]
            if (process.send) {
                process.send('ready');
                console.log('[PM2] Sent ready signal after full initialization.');
            }
        } catch(e) {
            console.error('[Init Error]', e.message);
            if (process.send) process.send('ready'); // 실패해도 ready 발행
        }
    }, 3000);
    
    // 4. 최초 보고서 생성 (5분 후) [TASK-022]
    setTimeout(runReportGenerator, 5 * 60 * 1000);
    setInterval(runReportGenerator, 3600000);
});

// --- [END] INITIALIZATION ---
