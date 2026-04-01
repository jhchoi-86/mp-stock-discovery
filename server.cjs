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
const { startFullUniversePoller, getFullPriceCache, getCachedPrice } = require('./src/utils/fullUniversePoller.cjs');
const { Queue } = require('bullmq');
const redisClient = require('./platform/infra/redis/client.cjs');
const { verifyAndApprove } = require('./platform/approval/tdr_bridge/tdrGate.cjs');

const aiScoringQueue = new Queue('aiScoringQueue', { connection: redisClient });

const app = express();
const PORT = process.env.PORT || 3001;

// Global Mutex to prevent multiple auto-syncs from overlapping (NEW-02 Correction)
let isSyncMutexLocked = false;
let currentSyncProcess = null; 

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

// 🔴 [Red Team 방어 - R11] 데이터 보존을 위한 스냅샷 저장 시스템 (BUG-02 통합/수정)
async function saveSyncSnapshot(signals) {
    try {
        if (!Array.isArray(signals) || signals.length === 0) return;
        
        // 필터 기준: signal_HH(최종추천) 또는 cond_up7(상승박스) 또는 일정 점수 이상
        const importantSignals = signals.filter(s => 
            s.signal_HH || 
            s.cond_up7 || 
            (s.total_score && s.total_score >= 10)
        );
        
        if (importantSignals.length === 0) {
            console.log('[Archival] No important signals to save. Skipping snapshot.');
            return;
        }

        const snapshot = await prisma.syncSnapshot.create({
            data: {
                category: 'INTEGRATED_SYNC',
                signals: importantSignals,
                stockCount: signals.length,
                importantCount: importantSignals.length,
                createdAt: new Date()
            }
        });
        console.log(`[Archival] Successfully saved sync snapshot (ID: ${snapshot.id}, Signals: ${importantSignals.length})`);
        return snapshot;
    } catch (e) {
        console.error('[Archival Error] Failed to save SyncSnapshot:', e.message);
    }
}

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
const prisma = require('./src/lib/prisma.cjs');
BigInt.prototype.toJSON = function() { return this.toString() };

const cookieParser = require('cookie-parser');
const authRouter = require('./src/routes/auth.cjs');
const adminRouter = require('./src/routes/admin.cjs');
const usersRouter = require('./src/routes/users.cjs');
const reportRouter = require('./src/routes/report.cjs');
const leadsRouter = require('./src/routes/leads.cjs');
const publicReportsRouter = require('./src/routes/publicReports.cjs');

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
app.use('/api/v1/leads', leadsRouter);
app.use('/api/reports/daily', publicReportsRouter(getFullPriceCache));

const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');

// 🔴 [Red Team 방어 - R2] signals.json 원자적(Atomic) 락 시스템
let isSignalFileLocked = false;
const signalWriteQueue = [];
const MAX_QUEUE_SIZE = 50;

async function withSignalLock(fn) {
    return new Promise((resolve, reject) => {
        const execute = async () => {
            if (isSignalFileLocked) {
                if (signalWriteQueue.length >= MAX_QUEUE_SIZE) {
                    return reject(new Error('Signal write queue overflow (MAX 50)'));
                }
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
    try {
        // 🔴 [BUG-07 Hotfix] CACHED_SIGNALS가 파일 변경을 감지하지 못함
        // 동기화 중에는 파일에서 직접 읽어서 최신 데이터를 반환하도록 수정
        const signalsData = fs.readFileSync(SIGNALS_FILE, 'utf8');
        res.send(signalsData);
    } catch (e) {
        res.send(CACHED_SIGNALS); // 폴백
    }
});

// 🔴 [Red Team 방어 - R9] 동기화 상태 복구 지원
let currentSyncProgress = { current: 0, total: 350, timeframe: '준비' };
app.get('/api/auto-sync/status', requireProAuth, (req, res) => {
    res.json({
        isSyncing: isSyncMutexLocked,
        progress: currentSyncProgress
    });
});

// SSE Clients & Heartbeat Activity Tracking
let clients = [];

// 🔴 [SSE Heartbeat - R11] 5초 주기 연결 유지 신호 (전력 효율보다 연결 안정성 우선)
setInterval(() => {
    clients.forEach(c => {
        try {
            c.write(': keep-alive\n\n'); 
            if (c.flush) c.flush();
        } catch(e) {}
    });
}, 5000);

const broadcastUpdate = () => {
    const payload = `data: ${JSON.stringify({ type: 'update' })}\n\n`;
    clients.forEach(c => {
        try {
            c.write(payload);
            if (c.flush) c.flush();
        } catch(e) {}
    });
};

const lastActiveMap = new Map(); // userId -> lastActiveTimestamp
const jwt = require('jsonwebtoken');

// 🔴 [Heartbeat Middleware] Track user activity on every request
const trackActivity = (req, res, next) => {
    const token = req.cookies?.accessToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            if (decoded.userId) {
                lastActiveMap.set(decoded.userId, Date.now());
            }
        } catch(e) {}
    }
    next();
};

app.use(trackActivity);

// 🔴 [Archive API] Snapshots for Historical Browsing
app.get('/api/archive/snapshots', async (req, res) => {
    try {
        const snapshots = await prisma.syncSnapshot.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, category: true, createdAt: true },
            take: 30 // 최신 30개 (박스 개수 제한)
        });
        res.json(snapshots);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/archive/snapshots/:id', async (req, res) => {
    try {
        const snapshot = await prisma.syncSnapshot.findUnique({
            where: { id: req.params.id }
        });
        if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
        res.json(snapshot);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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

    // 🔴 [Red Team 방어 - R10] 즉시 상태 브로드캐스트 (새로고침 시 데이터 유지 보장)
    try {
        const initialPayloads = [
            `data: ${JSON.stringify({ type: 'sync_progress', payload: currentSyncProgress })}\n\n`,
            `data: ${JSON.stringify({ type: 'update' })}\n\n`
        ];
        initialPayloads.forEach(p => {
            res.write(p);
            if (res.flush) res.flush();
        });
    } catch(e) {
        console.error('[SSE Initial Burst Error]', e.message);
    }

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
    res.json(onlineIds);
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

// [Public] 라이브 시그널 약식 조회 (Landing Page 마키용 - 누구나 접근 가능)
app.get('/api/public/live-signals', async (req, res) => {
    try {
        const signals = JSON.parse(await fs.promises.readFile(path.join(__dirname, 'data/signals.json'), 'utf8'));
        // 상위 10개만, 보안상 가격/상세전략 제외하고 기초 정보만 노출
        const publicSignals = signals.slice(-10).reverse().map(s => ({
            code: s.code,
            name: s.name,
            type: s.signal_HH ? 'SIGNAL' : 'UPDATE',
            timeframe: s.timeframe,
            timestamp: s.timestamp
        }));
        res.json(publicSignals);
    } catch (error) {
        console.error('Public live signals error:', error);
        res.status(500).json({ error: '데이터를 불러올 수 없습니다.' });
    }
});

// [Public] 성과 통계 조회 (Landing Page용 - PAID 회원 이상 권한 필요)
app.get('/api/public/daily-snapshots', requireProAuth, async (req, res) => {
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
    
    const rawSnapshots = await prisma.dailyStockSnapshot.findMany({
        where,
        orderBy: { [sortBy]: order },
        take: 1000
    });
    
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

        // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
        await withSignalLock(async () => {
            const signals = JSON.parse(await fs.promises.readFile(SIGNALS_FILE, 'utf8'));
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
        // Kill any pending sync process during reset
        if (currentSyncProcess) {
            console.log('[Reset] Killing current sync process...');
            currentSyncProcess.kill('SIGINT'); 
            currentSyncProcess = null;
            isSyncMutexLocked = false;
        }

        // 🔴 [Red Team 방어 - R2] TOCTOU 원자적 락 적용
        await withSignalLock(async () => {
            const emptySignals = JSON.stringify([], null, 2);
            await fs.promises.writeFile(SIGNALS_FILE, emptySignals);
            // ❌ STOCK_MASTER_FILE should NOT be cleared! It's the 350-stock index.
            // Only clear signals.json
            CACHED_SIGNALS = emptySignals; 
            lastSignalsMtimeMs = Date.now();
        });
        alertCache.clear();
        res.json({ message: '모든 분석 데이터가 초기화되었습니다. (종목 유니버스는 유지됨)' });
    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ error: '초기화 중 오류가 발생했습니다.' });
    }
});

// Stop synchronization
app.post('/api/auto-sync/stop', requireProAuth, (req, res) => {
    if (currentSyncProcess) {
        currentSyncProcess.kill('SIGINT');
        currentSyncProcess = null;
        isSyncMutexLocked = false;
        return res.json({ message: '동기화가 중단되었습니다.' });
    }
    res.json({ message: '현재 실행 중인 동기화가 없습니다.' });
});


// RESET: Deleted obsolete /api/auto-sync here (Consolidated at the bottom)


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
    // startNightlyMonitor(getCachedPrice); // [DISABLED]

    async function archiveOldSignals() {
        console.log('[Archive] Starting old signals cleanup...');
        const retentionDays = parseInt(process.env.SIGNAL_RETENTION_DAYS || '7');
        const archiveRetentionDays = parseInt(process.env.ARCHIVE_RETENTION_DAYS || '90');
        const maxFiles = 90;
        
        await withSignalLock(async () => {
            const raw = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
            const signals = JSON.parse(raw);
            // 🔴 [NEW-04 Fix] 신규 중첩 구조는 timestamp가 없으므로 아카이브 대상에서 제외하고 항상 보존
            const toKeep = signals.filter(s => s.timeframeStatus || (s.timestamp && s.timestamp >= cutoffTime));
            const toArchive = signals.filter(s => !s.timeframeStatus && s.timestamp && s.timestamp < cutoffTime);
            
            if (toArchive.length > 0) {
                const archiveDir = path.join(__dirname, 'data', 'archive');
                if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
                
                const d = new Date();
                const pad = n => n.toString().padStart(2, '0');
                const dateStr = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
                const archFile = path.join(archiveDir, `signals_${dateStr}.json`);
                
                let existing = [];
                if (fs.existsSync(archFile)) existing = JSON.parse(await fs.promises.readFile(archFile, 'utf8'));
                await fs.promises.writeFile(archFile, JSON.stringify([...existing, ...toArchive], null, 2));
                
                const tmpFile = SIGNALS_FILE + '.tmp';
                await fs.promises.writeFile(tmpFile, JSON.stringify(toKeep, null, 2));
                await fs.promises.rename(tmpFile, SIGNALS_FILE);
                
                child.on('close', (code) => {
                    console.log(`Integrated Sync child process exited with code ${code}`);
                    isSyncMutexLocked = false;
                    currentSyncProcess = null;
                    
                    if (code === 0) {
                        // 🔴 [BUG-11 Hotfix] 명시적 완료 신호 전송
                        // 모든 타임프레임이 끝났을 때 확실하게 broadcast
                        broadcast({ type: 'sync_progress', payload: { ...currentSyncProgress, current: currentSyncProgress.total, timeframe: '완료' } });
                        broadcast({ type: 'sync_complete', message: "통합 자동 동기화가 모든 타임프레임에 대해 완료되었습니다." });
                        
                        // 캐시 업데이트
                        try {
                            const signalsData = fs.readFileSync(SIGNALS_FILE, 'utf8');
                            CACHED_SIGNALS = JSON.parse(signalsData);
                        } catch (e) {
                            console.error("Final cache update failed:", e);
                        }
                    } else {
                        broadcast({ type: 'sync_error', message: `동기화 프로세스가 중단되었습니다 (코드: ${code})` });
                    }
                });
                
                console.log(`[Archive] Archived ${toArchive.length} signals. Remaining: ${toKeep.length}.`);
                refreshCacheNow();
            }
            
            // Clean up old archives
            const archiveDir = path.join(__dirname, 'data', 'archive');
            if (fs.existsSync(archiveDir)) {
                let files = fs.readdirSync(archiveDir).filter(f => f.startsWith('signals_'));
                const fileCutoff = Date.now() - (archiveRetentionDays * 24 * 60 * 60 * 1000);
                
                files = files.filter(f => {
                    const stats = fs.statSync(path.join(archiveDir, f));
                    if (stats.mtimeMs < fileCutoff) {
                        fs.promises.unlink(path.join(archiveDir, f)).catch(()=>{});
                        return false;
                    }
                    return true;
                });
                
                if (files.length > maxFiles) {
                    files.sort();
                    const toDelete = files.slice(0, files.length - maxFiles);
                    toDelete.forEach(f => fs.promises.unlink(path.join(archiveDir, f)).catch(()=>{}));
                }
            }
        });
    }

    cron.schedule(process.env.ARCHIVE_CRON_TIME || '0 2 * * *', () => archiveOldSignals());

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

            // 🔴 [NEW-01 Fix] 백엔드 저장 구조(timeframeStatus)에 맞게 파싱 로직 수정 (BUG-04와 동일 구조)
            const getSignalsForStock = (code) => {
              const allEntries = signals.filter(s => s.code === code);
              // 1. 통합 동기화 구조 우선 확인
              const integratedEntry = allEntries.find(s => s.timeframeStatus);
              if (integratedEntry) return integratedEntry.timeframeStatus;
              
              // 2. Webhook/CSV 플랫 구조 폴백
              const status = {};
              const tfs = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];
              tfs.forEach(tf => {
                status[tf] = allEntries
                  .filter(s => s.timeframe === tf)
                  .sort((a, b) => b.timestamp - a.timestamp)[0];
              });
              return status;
            };

            const getStockEntry = (code) => signals.find(s => s.code === code);

            let candidates = stocks.map(stock => {
              const stockEntry = getStockEntry(stock.code);
              const tfSigs = getSignalsForStock(stock.code);
              
              // 🔴 [BUG-05 Sync] 백엔드에서 이미 계산된 점수를 그대로 사용 (중복 계산 방지)
              // 분석기(analyzer.cjs)가 이미 모든 로직을 반영하여 total_score를 산출함
              const score = stockEntry?.total_score || 0;
              
              // 리포트에 표시할 대표 신호 (2H -> 1D -> 4H 순으로 우선순위 탐색)
              const bestTf = '2H';
              const bestSignal = tfSigs[bestTf] || tfSigs['1D'] || tfSigs['4H'] || {};
              
              return { 
                ...stock, 
                timeframeStatus: tfSigs, 
                latestSignal: bestSignal, 
                total_score: score 
              };
            }).filter(s => s.latestSignal && Object.keys(s.latestSignal).length > 0);

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

            // --- Phase 13: Full Universe Persistence to DailyStockSnapshot ---
            console.log(`[Cron] Persisting ${candidates.length} performance snapshots to DB...`);
            try {
                const snapshotData = candidates.map(s => ({
                    code: s.code,
                    name: s.name,
                    category: s.total_score >= 80 ? '추천종목' : '스나이퍼 포착',
                    score: s.total_score,
                    adx: s.latestSignal?.adx || 0,
                    currentPrice: s.latestSignal?.current_price || s.latestSignal?.entry_price || 0,
                    entryPrice1: s.latestSignal?.result_2 || 0,
                    yield: s.latestSignal?.kis_change_data?.rate || 0,
                    tradeAmount: s.latestSignal?.kis_change_data?.trade_amount ? BigInt(s.latestSignal.kis_change_data.trade_amount) : 0n,
                    foreignBuy: String(s.latestSignal?.kis_change_data?.foreign_buy || '-'),
                    instBuy: String(s.latestSignal?.kis_change_data?.inst_buy || '-')
                }));
                
                await prisma.dailyStockSnapshot.createMany({ data: snapshotData });
                console.log(`[Cron] Successfully persisted ${snapshotData.length} records to DB.`);
            } catch (snapErr) {
                console.error('[Cron] Snapshot Persistence Error:', snapErr);
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

        } catch(e) {
            console.error('[Cron Error] 야간 자동 발송 중 오류 발생:', e);
        }
    }, { timezone: "Asia/Seoul" });
}


// ─────────────────────────────────────────────────────────────────────────
// [API] Integrated Auto-sync Trigger (with Archival)
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/auto-sync', async (req, res) => {
    const { intervals, timeframe, timeframes } = req.body;
    // 🔴 [BUG-01 Red Team Fix] 2중 배열 방지: timeframe/timeframes/intervals 중 하나를 평탄한 배열로 변환
    let source = intervals || timeframes || timeframe || ['1D'];
    const targetIntervals = Array.isArray(source) ? source.flat() : [source];
    
    const cronSecret = req.headers['x-cron-secret'] || req.headers['x-internal-cron-secret'];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    // Support both header secret AND valid Admin/PRO JWT
    let isAllowed = (cronSecret === process.env.CRON_SECRET || cronSecret === 'mpstock_discovery_secret_2024');
    let userRole = 'NONE';
    
    if (!isAllowed && bearerToken && bearerToken !== 'null' && bearerToken !== 'undefined') {
        try {
            const decoded = require('jsonwebtoken').verify(bearerToken, process.env.JWT_ACCESS_SECRET);
            userRole = decoded.role || 'NONE';
            if (userRole === 'ADMIN' || userRole === 'PAID' || userRole === 'PRO_USER') {
                isAllowed = true;
            }
        } catch(e) {
            console.error('[Auto-Sync] JWT Verify Fallback Error:', e.message);
        }
    }

    if (!isAllowed) {
        console.warn(`[Auto-Sync] Rejected sync origin: ${req.ip}, Role: ${userRole}, TokenExists: ${!!bearerToken}`);
        return res.status(401).json({ error: 'Unauthorized: Admin or Pro permission required' });
    }

    if (!Array.isArray(targetIntervals)) {
        return res.status(400).json({ error: 'Intervals array required' });
    }

    if (isSyncMutexLocked) {
        return res.status(409).json({ error: 'Sync already in progress' });
    }

    const { spawn } = require('child_process');
    console.log(`[Integrated Sync] Starting sync for intervals: ${targetIntervals.join(', ')}`);
    isSyncMutexLocked = true;

    // 🔴 [BUG-09 Hotfix] 즉시 진행률 초기화 및 전송
    currentSyncProgress = { current: 0, total: targetIntervals.length * 350, timeframe: '준비' };
    clients.forEach(c => c.write(`data: ${JSON.stringify({ type: 'sync_progress', payload: currentSyncProgress })}\n\n`));

    const syncProcess = spawn('node', ['analyzer.cjs', ...targetIntervals], {
        env: { ...process.env, SYNC_MODE: 'integrated' }
    });
    currentSyncProcess = syncProcess;

    res.status(202).json({ 
        message: 'Sync started successfully', 
        isSyncing: true,
        targetIntervals
    });

    let lineBuffer = '';
    syncProcess.stdout.on('data', (data) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop();

        lines.forEach(line => {
            if (!line.trim()) return;
            console.log(`[Analyzer] ${line.trim()}`);
            
            const progressMatch = line.match(/\[PROGRESS\]\s+(\w+):(\d+)\/(\d+)/);
            if (progressMatch) {
                const [, tf, current, total] = progressMatch;
                
                // 🔴 [BUG-03 Red Team Fix] 전체 타임프레임을 고려한 누적 진행률 계산 (조기 완료 방지)
                const tfIndex = targetIntervals.indexOf(tf);
                const totalTfCount = targetIntervals.length;
                const absoluteCurrent = (tfIndex >= 0 ? tfIndex * 350 : 0) + parseInt(current);
                const absoluteTotal = 350 * totalTfCount;

                const progressData = {
                    type: 'progress',
                    timeframe: tf,
                    current: absoluteCurrent,
                    total: absoluteTotal
                };
                
                // 🔴 [Red Team 방어 - R9] 동기화 상태 복구 지원 (메모리 업데이트)
                currentSyncProgress = {
                    current: progressData.current,
                    total: progressData.total,
                    timeframe: progressData.timeframe
                };

                // Broadcast progress AND trigger a signal update (incremental saves)
                clients.forEach(c => {
                    c.write(`data: ${JSON.stringify({ type: 'sync_progress', payload: progressData })}\n\n`);
                    c.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`);
                    if(c.flush) c.flush();
                });
            }
        });
    });

    // 🔴 [NEW-02 Fix] 프로세스 시작/실행 실패 시 SSE로 에러 브로드캐스트 (UI 고착 방지)
    syncProcess.on('error', (err) => {
        console.error(`[Integrated Sync] Failed to start analyzer process: ${err.message}`);
        isSyncMutexLocked = false;
        clients.forEach(c => {
            c.write(`data: ${JSON.stringify({ type: 'sync_error', message: err.message })}\n\n`);
            if(c.flush) c.flush();
        });
    });

    syncProcess.on('close', async (code, signal) => {
        console.log(`[Integrated Sync] Process finished with code ${code}, signal ${signal}`);
        isSyncMutexLocked = false;
        
        // 🔴 [Red Team 방어] 동기화 종료 시 상태 초기화
        if (code === 0) {
            // 🔴 [BUG-11 Hotfix] 명시적 완료 신호 전송 (V1.3)
            currentSyncProgress = { ...currentSyncProgress, current: currentSyncProgress.total, timeframe: '완료' };
            clients.forEach(c => {
                c.write(`data: ${JSON.stringify({ type: 'sync_progress', payload: currentSyncProgress })}\n\n`);
                c.write(`data: ${JSON.stringify({ type: 'sync_complete', message: "SUCCESS_V1_3" })}\n\n`);
                if(c.flush) c.flush();
            });
            
            // 🔴 캐시 즉시 업데이트
            try {
                const signalsData = fs.readFileSync(path.join(__dirname, 'data', 'signals.json'), 'utf8');
                CACHED_SIGNALS = JSON.parse(signalsData);
            } catch(e) {}
            
            try {
                const signalsPath = path.join(__dirname, 'data', 'signals.json');
                if (fs.existsSync(signalsPath)) {
                    const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
                    await saveSyncSnapshot(signals);
                }
                // Broadcast final update (for other tabs)
                clients.forEach(c => {
                    c.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`);
                    if(c.flush) c.flush();
                });
            } catch (err) {
                console.error('[Archival Error] Failed to save SyncSnapshot:', err);
            }
        } else {
            console.error(`[Integrated Sync] Process failed with code ${code}`);
        }
    });
});

// ==========================================
// Phase 5: Ensure the server binds to the port and signals PM2
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[REST API] Server is successfully running on port ${PORT}`);

    // --- Task 9: Automated Daily Report Generation ---
    const { exec } = require('child_process');
    const path = require('path');
    const runReportGenerator = () => {
        const scriptPath = path.join(__dirname, 'scripts', 'generateReport.cjs');
        exec(`node "${scriptPath}"`, (error, stdout) => {
            if (error) console.error(`[Cron Error] ${error.message}`);
            else console.log(`[ReportGen Output] ${stdout}`);
        });
    };
    // [DISABLED] runReportGenerator(); // Initial run
    // [DISABLED] setInterval(runReportGenerator, 3600000); // 1-hour interval

    // PM2 배포 무중단 리로드를 위해 반드시 필요한 신호방출 코드
    if (process.send) {
        process.send('ready');
        console.log(`[PM2] Sent 'ready' signal for zero-downtime deployment.`);
    }
    // R4: 백그라운드 AI 엔진 웜업 핑 (1회성)
    // setTimeout(pingAIService, 5000); // [DISABLED]

    // [DISABLED] startNightlyMonitor(getKisAccessToken);
});
