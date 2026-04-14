require('dotenv').config();
const prisma = require('./src/utils/prismaClient.cjs');

// [TASK-S14] Global BigInt Serialization Safety
BigInt.prototype.toJSON = function() { return this.toString(); };

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
const { prefetchKisCache } = require('./src/utils/kisCache.cjs');
const redis = require('./platform/infra/redis/client.cjs'); // [TASK-E2] Global redis client for caching
// const TelegramBot = require('node-telegram-bot-api'); // [MP-DEBUG-002] Disabled pending usage
dns.setDefaultResultOrder('ipv4first');

const { calculateTotalScore, getCategory, getStars } = require('./src/utils/scoreEngine.cjs');
const { toKST, getKSTDateString, nowKST } = require('./src/utils/kst.cjs'); // [TASK-CC02] KST 공통 유틸 도입

// 플랜 3: 백엔드 무결성 자동 검증 시스템 가동
const { verifyIntegrity } = require('./src/utils/integrityGuard.cjs');
verifyIntegrity();

const cron = require('node-cron');
const { calculateSignals, resampleChartData } = require('./analyzer.cjs');
const { savePastRecommendations, evaluatePastRecommendations, generateSummaryReport, EXCEL_FILE } = require('./src/utils/historyManager.cjs');
const { startNightlyMonitor } = require('./src/utils/nightlyMonitor.cjs');
const { startFullUniversePoller, getCachedPrice, getFullPriceCache, updateCachedPrice } = require('./src/utils/fullUniversePoller.cjs');
const { Queue } = require('bullmq');

const { startWebSocketService, updateSubscriptions, getSubscribedCodes } = require('./src/services/kisWebSocketService.cjs');
const systemStatsService = require('./src/services/systemStatsService.cjs');
const { verifyAndApprove } = require('./platform/approval/tdr_bridge/tdrGate.cjs');
const { isKSTTradingHours, isTradingDay } = require('./platform/markets/kr_equity/marketHours.cjs');
const PublishingService = require('./src/services/publishingService.cjs');
const BulkSyncService = require('./src/services/BulkSyncService.cjs'); // [STEP-04] Added for manual price protection
global.publishingService = new PublishingService();

let aiScoringQueue = null;
try {
    const redisClient = require('./platform/infra/redis/client.cjs');
    aiScoringQueue = new Queue('aiScoringQueue', { connection: redisClient });
    console.log('[BullMQ] aiScoringQueue initialized successfully.');
} catch (e) {
    console.warn('[BullMQ] Redis unavailable. AI scoring queue disabled:', e.message);
}

const app = express();
// [TASK-S14] Safe BigInt Serialization (Alternative to global prototype patch)
app.set('json replacer', (key, value) => {
    return typeof value === 'bigint' ? value.toString() : value;
});
const PORT = process.env.PORT || 3001;

// [MP-DEBUG-003] Platform routers MOVED below middleware for proper CORS/Auth parsing

// Telegram Alert Setup
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
// 콤마(,)로 구분하여 여러 명의 챗 아이디 입력 가능. 단체방/채널은 음수(-) 아이디를 사용해야 합니다.
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(id => id);
const alertCache = new Map(); // Prevent telegram spam

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
    if (!force && !kisAccessToken) {
        try {
            // [TASK-S05] 비동기 파일 읽기로 전환 (이벤트 루프 블로킹 방지)
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
        // [TASK-S05] 비동기/원자적 파일 쓰기로 전환
        const dirExists = await fs.promises.access(TOKEN_DIR).then(() => true).catch(() => false);
        if (!dirExists) {
            await fs.promises.mkdir(TOKEN_DIR, { recursive: true });
        }
        
        const tempPath = KIS_TOKEN_FILE + '.tmp';
        await fs.promises.writeFile(tempPath, JSON.stringify({
            token: kisAccessToken,
            expiry: kisTokenExpiry
        }, null, 2));
        await fs.promises.rename(tempPath, KIS_TOKEN_FILE);
        
        console.log(`[KIS API] Token successfully issued and cached. Expires in ${response.data.expires_in}s`);
        
        return kisAccessToken;
    } catch (e) {
        console.error("[KIS API] Token Request Failed:", e.response?.data || e.message);
        throw new Error("Failed to get KIS Access Token");
    }
}
// [v6.3.0] Standardized Signal Scoring
const { calculateDisplayScore: scoreSignal, getGrade } = require('./platform/analysis/scoring/scorer.cjs');

// Phase 12-2 Zero-Day Patch: Lightweight Auth Guard (No DB Hits)
const authenticateToken = (req, res, next) => {
    // [v9.3.4] 내부 API 시크릿 검증 (관리용 스크립트 대응)
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET) {
        req.user = { role: 'ADMIN', internal: true };
        return next();
    }

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

// [v6.6.0] PAID 이상 등급 전용 접근 미들웨어 (작업지시서 GAP-1)
const requirePaidOrAdmin = (req, res, next) => {
    const ALLOWED_ROLES = ['PAID', 'PRO_USER', 'ADMIN'];
    if (req.user && ALLOWED_ROLES.includes(req.user.role)) {
        next();
    } else {
        res.status(403).json({ error: '유료 회원 전용 기능입니다. 프리미엄 구독 후 이용해 주세요.' });
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

const cookieParser = require('cookie-parser');
const authRouter = require('./src/routes/auth.cjs');
const adminRouter = require('./src/routes/admin.cjs');
const usersRouter = require('./src/routes/users.cjs');
const reportRouter = require('./src/routes/report.cjs');
const leadsRouter = require('./src/routes/leads.cjs');
const { router: publicReportsRouter, getLatestReportHandler } = require('./src/routes/publicReports.cjs');
const ssotRouter = require('./src/routes/ssot.cjs');
const dailyTop5Router = require('./src/routes/dailyTop5.cjs');

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
app.use('/api/ssot', ssotRouter);
app.use('/api/daily-top5', dailyTop5Router);

// [TASK-E4] GET /api/stock-snapshot - DB의 DailyStockSnapshot을 단일 소스로 반환
app.get('/api/stock-snapshot', authenticateToken, async (req, res) => {
  const { ticker, date } = req.query;
  
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  try {
    // 1. Redis 캐시 우선 조회
    const cacheKey = `mp:snapshot:${ticker}:${targetDate.toISOString().split('T')[0]}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }

    // 2. DB 조회
    const snapshot = await prisma.dailyStockSnapshot.findFirst({
      where: {
        ticker,
        syncDate: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!snapshot) {
      return res.status(404).json({ error: `${ticker} 스냅샷 없음` });
    }

    // 3. 캐시 저장 후 반환
    await redis.set(cacheKey, JSON.stringify(snapshot), 'EX', 1800);
    return res.json({ source: 'db', data: snapshot });

  } catch (err) {
    console.error('[Snapshot API]', err);
    return res.status(500).json({ error: err.message });
  }
});

// [TASK-E4] GET /api/top5 — Top5 전용 엔드포인트
app.get('/api/top5', authenticateToken, async (req, res) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  try {
    // Redis 캐시 확인
    const cacheKey = `mp:top:5:${targetDate.toISOString().split('T')[0]}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: JSON.parse(cached) });

    // DB에서 Top5 조회 (rank 기준 정렬)
    const top5 = await prisma.dailyStockSnapshot.findMany({
      where: {
        isTop5:   true,
        syncDate: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) },
      },
      orderBy: { rank: 'asc' },
      take:    5,
    });

    await redis.set(cacheKey, JSON.stringify(top5), 'EX', 1800);
    return res.json({ source: 'db', data: top5 });

  } catch (err) {
    console.error('[Top5 API]', err);
    return res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// Forward /api/public/recommendations directly to the handler
app.get('/api/public/recommendations', getLatestReportHandler);

// [v9.3.4] GET /api/public/top5-strategy — reads from DB SyncSaveLog (SSOT)
app.get('/api/public/top5-strategy', async (req, res) => {
  try {
    const latest = await prisma.syncSaveLog.findFirst({
      orderBy: { savedAt: 'desc' }
    });
    if (!latest || !latest.snapshot) {
      return res.status(404).json({ error: 'Strategy data not found', data: [] });
    }
    const stocks = Array.isArray(latest.snapshot) ? latest.snapshot : [];
    res.json({ success: true, tagName: latest.tagName, savedAt: latest.savedAt, data: stocks });
  } catch (e) {
    console.error('[top5-strategy] DB read failed:', e.message);
    res.status(500).json({ error: 'Failed to fetch strategy data', data: [] });
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

// [v9.3.4] GET /api/public/sync-history-tags (Used by Performance/Analysis pages)
app.get('/api/public/sync-history-tags', async (req, res) => {
  try {
    const logs = await prisma.syncSaveLog.findMany({
      select: { tagName: true, savedAt: true },
      orderBy: { savedAt: 'desc' },
      take: 20
    });
    res.json(logs);
  } catch (e) {
    console.error('[sync-history-tags] Error:', e.message);
    res.status(500).json({ error: 'Failed to fetch sync history' });
  }
});

// [v9.3.4] GET /api/public/sync-history-details/:tagName
app.get('/api/public/sync-history-details', async (req, res) => {
  try {
    const tagName = req.query.tagName || req.query.tag;
    if (!tagName) {
      return res.status(400).json({ error: 'tagName is required' });
    }
    const log = await prisma.syncSaveLog.findFirst({
      where: { tagName: tagName }
    });
    if (!log || !log.snapshot) {
      return res.status(404).json({ error: 'Sync log not found' });
    }
    // Return the snapshot array directly for the analytics table
    res.json(log.snapshot);
  } catch (e) {
    console.error('[sync-history-details] Error:', e.message);
    res.status(500).json({ error: 'Failed to fetch sync details' });
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

// 🔴 [Red Team 방어 - R2] signals.json 원자적(Atomic) 락 시스템 (v7.7.22 - Refactored to Promise Queue)
let signalLockQueue = Promise.resolve();

async function withSignalLock(fn) {
    const prevLock = signalLockQueue;
    let release;
    const nextLock = new Promise(resolve => { release = resolve; });
    signalLockQueue = nextLock; // 즉시 다음 대기열 등록 (atomic)

    try {
        // [Red Team Fix - R9] 300초 타임아웃 도입으로 Starvation 방지
        await Promise.race([
            prevLock,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SignalLock Timeout - 300s exceeded')), 300000))
        ]);
        return await fn();
    } catch (e) {
        console.error('[SignalLock] Error:', e.message);
        throw e;
    } finally {
        release(); // 다음 작업 진행 허가
    }
}

// [v5.0.0] Live Signal Board Poller Functions (Standardized via marketHours.cjs)

let isLivePollerRunning = false;
function startLiveSignalPoller() {
    const { fetchHybridHistory, getKisAccessToken, calculateSignals } = require('./analyzer.cjs');
    
    const poller = async () => {
        if (!isKSTTradingHours()) return; 
        if (isLivePollerRunning) {
            console.log('[SignalPoller] Already running, skip this tick.');
            return;
        }
        
        isLivePollerRunning = true;
        
        try {
            // [TASK-S08] Load TOP 5 stocks from latest.json
            let top5 = [];
            try {
                const latestPath = path.join(__dirname, 'data/vip_logs/latest.json');
                if (fs.existsSync(latestPath)) {
                    const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                    top5 = (report.stocks || []).slice(0, 5).map(s => s.ticker || s.code);
                    top5 = top5.filter(Boolean); // [v9.4.21] Filter out any undefined/null values
                }
            } catch (e) { 
                console.error('[SignalPoller] TOP 5 로드 실패:', e.message);
                isLivePollerRunning = false;
                return; 
            }
            
            if (top5.length === 0) {
                isLivePollerRunning = false;
                return;
            }

            // [v9.3.4] Fix: prisma.stockMaster is missing in schema.prisma. Load from local file.
            const allStocks = JSON.parse(await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8'));
            const stocks = allStocks.filter(s => top5.includes(s.code));
            const kisToken = await getKisAccessToken();
            
            console.log(`[SignalPoller] Checking 2M/5M signals for TOP 5: ${top5.join(',')}`);
            
            // [v9.3.4] Direct Integration (No exec) - 타임프레임 확장 (1D, 1H, 30M 추가)
            const timeframes = ['1D', '1H', '30M', '2M', '5M'];
            const allResults = [];

            for (const tf of timeframes) {
                const results = await Promise.all(stocks.map(async (stock) => {
                    try {
                        const days = { '1D': 365, '1H': 60, '30M': 30, '5M': 5, '2M': 3 }[tf] || 90;
                        const interval = { '1D': '1d', '1H': '1h', '30M': '30m', '5M': '5m', '2M': '2m' }[tf] || '1h';
                        const history = await fetchHybridHistory(stock, days, interval, kisToken);
                        const signal = calculateSignals(history, tf);
                        if (signal) return { ...signal, code: stock.code, name: stock.name };
                    } catch (err) {
                        console.error(`[SignalPoller] Error for ${stock.code} ${tf}:`, err.message);
                    }
                    return null;
                }));
                allResults.push(...results.filter(r => r !== null));
            }

            // Save results to signals.json (Atomic)
            if (allResults.length > 0) {
                const currentSigs = fs.existsSync(SIGNALS_FILE) ? JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8')) : [];
                // Update or Append logic
                const merged = [...currentSigs];
                for (const newSig of allResults) {
                    const idx = merged.findIndex(s => s.code === newSig.code && s.timeframe === newSig.timeframe);
                    if (idx > -1) merged[idx] = newSig;
                    else merged.push(newSig);
                }
                const tempPath = SIGNALS_FILE + '.tmp';
                fs.writeFileSync(tempPath, JSON.stringify(merged, null, 2));
                fs.renameSync(tempPath, SIGNALS_FILE);
                
                updateTimeSlotSignals(top5);
                
                // SSE Publish
                if (global.publishingService) {
                    await global.publishingService.publishToAll(allResults);
                }
            }
        } catch (globalErr) {
            console.error('[SignalPoller] Fatal error:', globalErr.message);
        } finally {
            isLivePollerRunning = false;
        }
    };
    
    cron.schedule('*/5 * * * *', poller); // Every 5 minutes during trading hours
    poller();
}

function updateTimeSlotSignals(codes) {
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
                if (!code) return; // Skip invalid codes
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


app.get('/api/stocks', requireProAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(CACHED_STOCKS);
});

app.get('/api/signals', requireProAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    // Ensure scores are present (Fresh fallback if not yet updated in cache)
    try {
        const sigs = JSON.parse(CACHED_SIGNALS);
        const scored = sigs.map(s => ({
            ...s,
            score: s.score || scoreSignal(s, s.kis_change_data?.bonus_score || 0)
        }));
        res.json(scored);
    } catch(e) {
        res.send(CACHED_SIGNALS);
    }
});

// [FIX-01] GET /api/signals-summary — 코드별 그룹핑된 신호 데이터
// Phase 3 프론트엔드(useStockManager)가 요구하는 SSOT 형식
app.get('/api/signals-summary', requireProAuth, (req, res) => {
    try {
        // 1. 캐시된 신호 파싱
        const rawSigs = JSON.parse(CACHED_SIGNALS);
        if (!Array.isArray(rawSigs) || rawSigs.length === 0) {
            return res.json([]);
        }

        // Ensure scores are present (SSOT consistency)
        const allSignals = rawSigs.map(s => {
            return {
                ...s,
                score: s.score || (typeof scoreSignal === 'function' ? scoreSignal(s, s.kis_change_data?.bonus_score || 0) : 0),
                // [v9.3.9] Map Target Price back to fallback field Result_3 if not exists
                result_3: s.result_3 || s.target_price_1
            };
        });

        // 2. 코드별 그룹핑 (O(n) 단일 순회)
        const groupMap = new Map();

        for (const signal of allSignals) {
            const code = signal.code;
            if (!code) continue;

            if (!groupMap.has(code)) {
                groupMap.set(code, {
                    code,
                    latestSignal: null,
                    timeframeStatus: {}
                });
            }

            const group = groupMap.get(code);

            // timeframeStatus 에 TF별 최신 신호 유지
            const existing = group.timeframeStatus[signal.timeframe];
            if (!existing || signal.timestamp > existing.timestamp) {
                group.timeframeStatus[signal.timeframe] = signal;
            }

            // latestSignal: 전체 TF 중 가장 최신 타임스탬프
            if (!group.latestSignal || signal.timestamp > group.latestSignal.timestamp) {
                group.latestSignal = signal;
            }
        }

        // 3. Map → Array 변환 후 응답 시 통합 점수 재계산 (Frontend 요구사항)
        const result = Array.from(groupMap.values()).map(group => {
            const { score } = calculateTotalScore(group.timeframeStatus, group.latestSignal);
            return {
                ...group,
                total_score: score
            };
        });

        res.setHeader('Content-Type', 'application/json');
        res.json(result);

    } catch (e) {
        console.error('[signals-summary] Error:', e.message);
        res.status(500).json({ error: 'Failed to build signals summary' });
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

const broadcastUpdate = (customPayload) => {
    const defaultPayload = { type: 'signal_update' };
    const payload = `data: ${JSON.stringify(customPayload || defaultPayload)}\n\n`;
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
app.get('/api/admin/online-users', authenticateToken, isAdmin, (req, res) => {
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
app.get('/api/admin/daily-snapshots', authenticateToken, isAdmin, async (req, res) => {
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
app.get('/api/public/daily-snapshots', authenticateToken, requirePaidOrAdmin, async (req, res) => {
    const { date, code, sortBy = 'yield', order = 'desc' } = req.query;
    try {
        const snapshots = await getPerformanceSnapshotData({ date, code, sortBy, order });
        res.json(snapshots);
    } catch (err) {
        console.error('Failed to get public snapshots:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// [TASK-S07] KST 00:00:00 및 23:59:59 타임스탬프 생성 헬퍼
const toKSTMidnight = (dateStr, endOfDay = false) => {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    if (endOfDay) d.setTime(d.getTime() + 86399999);
    return d;
};

// Helper for performance snapshots
async function getPerformanceSnapshotData({ date, code, sortBy, order }) {
    const where = {};
    const isToday = !date || date === 'all' || date === new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

    if (date && date !== 'all') {
        const start = toKSTMidnight(date);
        const end = toKSTMidnight(date, true);
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
        
        const tmpFile = SIGNALS_FILE + '.tmp';
        await fs.promises.writeFile(tmpFile, JSON.stringify(signals, null, 2));
        await fs.promises.rename(tmpFile, SIGNALS_FILE);
    });

    console.log(`[PRD Signal] ${code}: DHH2=${newSignal.DHH2}, Progress=${newSignal.progress.toFixed(2)}, HH=${newSignal.signal_HH}`);
    
    // Telegram Alert Trigger
    if (newSignal.entry_approved) {
        let stockName = code;
        try {
            const stocksRaw = await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8');
            const stocks = JSON.parse(stocksRaw);
            const found = stocks.find(s => s.code === code);
            if (found) stockName = found.name;
        } catch (e) {}
        
        // Asynchronously send alert so we don't block the webhook response
        sendTelegramAlert(newSignal, stockName).catch(err => console.error(err));
    }

    await refreshCacheNow();
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

// ─────────────────────────────────────────────────────────────────────────
// [TASK-RS01] realtime_engine.py → Node.js → SSE 재브로드캐스트 라우트
// realtime_engine.py 가 /api/realtime/signal, /api/realtime/wbs-status 로
// POST 요청을 보내면, Node.js 가 이를 SSE 클라이언트에게 재전달한다.
// 인증: x-internal-api-key 헤더 (INTERNAL_API_SECRET 환경변수)
// ─────────────────────────────────────────────────────────────────────────
const verifyInternalKey = (req, res, next) => {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (!internalSecret) {
        console.warn('[SECURITY] INTERNAL_API_SECRET 미설정 — 내부 API 라우트 비활성화');
        return res.status(503).json({ error: 'Internal API not configured' });
    }
    if (req.headers['x-internal-api-key'] !== internalSecret) {
        console.warn(`[SECURITY] 무단 내부 API 접근 차단 (IP: ${req.ip})`);
        return res.status(403).json({ error: 'Forbidden: Invalid internal API key' });
    }
    next();
};

/**
 * POST /api/realtime/signal
 * realtime_engine.py 에서 감지한 WBS 절대신호를 SSE로 모든 클라이언트에게 재브로드캐스트.
 * 어드민에게만 브로드캐스트하는 스나이퍼 웹훅(/api/sniper/webhook)과 달리,
 * 구독 티어(FREE/STANDARD/PREMIUM)에 따라 차별 배포.
 */
app.post('/api/realtime/signal', verifyInternalKey, async (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !payload.stockCode) {
            return res.status(400).json({ error: 'Invalid signal payload: stockCode required' });
        }

        console.log(`[Realtime Signal] 수신: ${payload.stockCode} (${payload.signalType})`);

        // SSE 클라이언트에게 sniper_alert 타입으로 재브로드캐스트
        // useRealtimeSignal.js 가 'sniper_alert' 타입을 구독한다 (TASK-RS01 정렬)
        const eventData = JSON.stringify({ type: 'sniper_alert', payload });
        clients.forEach(client => {
            try {
                // PREMIUM/STANDARD 구독자 및 ADMIN에게 전달 (FREE 제외)
                const tier = client.userTier || 'FREE';
                if (tier === 'PREMIUM' || tier === 'STANDARD' || client.userRole === 'ADMIN') {
                    client.write(`data: ${eventData}\n\n`);
                    if (client.flush) client.flush();
                }
            } catch (e) { /* 연결 끊김 클라이언트 무시 */ }
        });


        // [v9.4.19 / R-08] signals_log 테이블에 시그널 영구 저장
        try {
            await prisma.signalsLog.create({
                data: {
                    stockCode:     payload.stockCode,
                    stockName:     payload.stockName   || null,
                    signalType:    payload.signalType  || 'BUY',
                    wbs1m:         payload.wbs1m       != null ? payload.wbs1m       : null,
                    wbs3m:         payload.wbs3m       != null ? payload.wbs3m       : null,
                    pScore:        payload.pScore      != null ? payload.pScore      : null,
                    predictiveRoi: payload.predictiveRoi != null ? payload.predictiveRoi : null,
                    entryPrice:    payload.entryPrice  != null ? Math.round(payload.entryPrice)  : null,
                    targetPrice:   payload.targetPrice != null ? Math.round(payload.targetPrice) : null,
                    stopPrice:     payload.stopPrice   != null ? Math.round(payload.stopPrice)   : null,
                    occurredAt:    payload.occurredAt  ? new Date(payload.occurredAt) : new Date(),
                }
            });
            console.log(`[Realtime Signal] DB 저장 완료: ${payload.stockCode}`);
        } catch (dbErr) {
            console.error('[Realtime Signal] DB 저장 실패 (SSE는 정상 발송):', dbErr.message);
        }

        res.status(200).json({ success: true, message: 'Signal broadcasted' });
    } catch (error) {
        console.error('[Realtime Signal Relay] Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * POST /api/realtime/wbs-status
 * realtime_engine.py 에서 1초 주기로 전송하는 WBS 게이지 업데이트.
 * price_snapshot 타입으로 SSE 브로드캐스트하여 기존 price 배치 처리 파이프라인과 통합.
 * 주파수가 높으므로 로그는 DEBUG 레벨에서만 출력.
 */
app.post('/api/realtime/wbs-status', verifyInternalKey, (req, res) => {
    try {
        const { ticker, wbs1m, wbs3m } = req.body;
        if (!ticker) {
            return res.status(400).json({ error: 'Invalid wbs payload: ticker required' });
        }

        // wbs_gauge 전용 이벤트 타입으로 브로드캐스트 (PREMIUM 이상)
        const eventData = JSON.stringify({
            type: 'wbs_gauge',
            data: { ticker, wbs1m, wbs3m, timestamp: Date.now() }
        });
        clients.forEach(client => {
            try {
                const tier = client.userTier || 'FREE';
                if (tier === 'PREMIUM' || client.userRole === 'ADMIN') {
                    client.write(`data: ${eventData}\n\n`);
                    if (client.flush) client.flush();
                }
            } catch (e) { /* 연결 끊김 무시 */ }
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[WBS Status Relay] Error:', error);
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
            const tmpFile = SIGNALS_FILE + '.tmp';
            await fs.promises.writeFile(tmpFile, JSON.stringify(merged, null, 2));
            await fs.promises.rename(tmpFile, SIGNALS_FILE);
        });

        console.log(`[Batch Import] ${newSignals.length} signals imported via CSV.`);
        await refreshCacheNow();
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
            const tmpFile = SIGNALS_FILE + '.tmp';
            await fs.promises.writeFile(tmpFile, resultStr);
            await fs.promises.rename(tmpFile, SIGNALS_FILE);
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

// [STEP-03] 수동 가격 편집용 Rate Limiter (인메모리 구현)
const priceEditLimiter = (() => {
  const store = new Map();
  const WINDOW_MS = 60 * 1000;
  const MAX_REQUESTS = 5;
  return (req, res, next) => {
    const key = `${req.params.code}:${req.user?.id || req.ip}`;
    const now = Date.now();
    const timestamps = (store.get(key) || []).filter(t => now - t < WINDOW_MS);
    if (timestamps.length >= MAX_REQUESTS) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: '1분에 최대 5회까지 수정 가능합니다.'
      });
    }
    timestamps.push(now);
    store.set(key, timestamps);
    next();
  };
})();

/**
 * [STEP-03] PATCH /api/stocks/:code/prices
 * 특정 종목의 매수/목표/손절가격을 수동으로 업데이트
 */
app.patch('/api/stocks/:code/prices', authenticateToken, isAdmin, priceEditLimiter, async (req, res) => {
  try {
    const { code } = req.params;

    // R-06: 정수 변환 (소수점 차단)
    const entry1    = Math.floor(Number(req.body.entry1));
    const entry2    = Math.floor(Number(req.body.entry2));
    const target    = Math.floor(Number(req.body.target));
    const stop_loss = Math.floor(Number(req.body.stop_loss));
    const dateStr   = req.body.date; // "YYYY-MM-DD"

    if ([entry1, entry2, target, stop_loss].some(v => isNaN(v) || v <= 0)) {
      return res.status(400).json({
        error: 'INVALID_VALUE',
        message: '모든 가격은 0보다 큰 정수여야 합니다.'
      });
    }

    // 가격 순서 검증 (서버사이드)
    if (stop_loss >= entry2)
      return res.status(400).json({ error: 'INVALID_PRICE_ORDER',
        message: `손절가(${stop_loss.toLocaleString()})는 2차 진입가보다 낮아야 합니다.` });
    if (entry2 >= entry1)
      return res.status(400).json({ error: 'INVALID_PRICE_ORDER',
        message: `2차 진입가(${entry2.toLocaleString()})는 1차 진입가보다 낮아야 합니다.` });
    if (entry1 >= target)
      return res.status(400).json({ error: 'INVALID_PRICE_ORDER',
        message: `1차 진입가(${entry1.toLocaleString()})는 목표가보다 낮아야 합니다.` });

    // "YYYY-MM-DD"를 00:00:00 KST로 변환
    const syncDate = new Date(dateStr);
    syncDate.setHours(0, 0, 0, 0);

    // ticker_syncDate 유니크 인덱스를 사용한 업데이터
    // DailyStockSnapshot 모델명 확인 (prisma/schema.prisma)
    const snapshot = await prisma.dailyStockSnapshot.findUnique({
      where: { ticker_syncDate: { ticker: code, syncDate } }
    });

    if (!snapshot) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `${code} / ${dateStr} 데이터가 존재하지 않습니다.`
      });
    }

    const updated = await prisma.dailyStockSnapshot.update({
      where: { id: snapshot.id },
      data: {
        inst_buy_manual:   entry1,
        inst_buy2_manual:  entry2,
        target_manual:     target,
        stop_loss_manual:  stop_loss,
        is_manual_price:   true,
        manual_updated_at: new Date()
      }
    });

    // Redis 캐시 무효화 (상세 페이지, 탑5 등)
    const cacheKeys = [
      `daily_top5:${dateStr}`,
      `landing_strategy:${dateStr}`,
      `stock_detail:${code}:${dateStr}`,
      `signal_summary:${dateStr}`
    ];
    await Promise.allSettled(cacheKeys.map(k => redis.del(k)));

    console.log(`[PriceEdit] ${code} 수동 편집 by ${req.user?.id || 'Unknown'}`);
    return res.json({
      success: true,
      code,
      updated: {
        entry1, entry2, target, stop_loss,
        is_manual: true,
        updated_at: updated.manual_updated_at
      }
    });

  } catch (err) {
    console.error('[PriceEdit] Error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// [OPT-01] KIS 공유 캐시 사전 수집 모듈 연동 완료

// Global Mutex to prevent multiple auto-syncs from overlapping and DDOSing the KIS API (EGW00201)
let isSyncMutexLocked = false;

// Helper to resample chart data
const resampleSyncData = (raw, hourCount, targetTf) => {
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

// [OPT-03] TF 그룹 정의
const TF_GROUPS = {
    // Yahoo 1d 인터벌 공유 — 동시 실행 가능
    DAILY:  { tfs: ['1D', '2D', '1W'], interval: '1d',  days: 365, sleep: 200 },
    // Yahoo 1h 인터벌 공유 — 동시 실행 가능
    HOURLY: { tfs: ['1H', '2H', '4H'], interval: '1h',  days: 60,  sleep: 150 },
    // Yahoo 30m 인터벌 — 단독 실행
    INTRA:  { tfs: ['30M'],            interval: '30m', days: 30,  sleep: 100 },
};

// 사용자가 요청한 TF 목록을 그룹으로 분류
function classifyTfGroups(requestedTfs) {
    const DAILY_TFS = ['1D','2D','1W'];
    const HOURLY_TFS = ['1H','2H','4H'];
    const INTRA_TFS = ['30M','15M','5M','2M'];
    const pick = (list) => requestedTfs.filter(tf => list.includes(tf));
    return {
        DAILY:  pick(DAILY_TFS).length  ? { tfs: pick(DAILY_TFS),  sleep: 300 } : null,
        HOURLY: pick(HOURLY_TFS).length ? { tfs: pick(HOURLY_TFS), sleep: 200 } : null,
        INTRA:  pick(INTRA_TFS).length  ? { tfs: pick(INTRA_TFS),  sleep: 150 } : null,
    };
}

// ─────────────────────────────────────────────────
// [OPT-03] TF 그룹 내 실행 함수
// ─────────────────────────────────────────────────
async function runTfGroup(groupName, groupConfig, stocks, kisSharedCache, kisTokenGlobal, emitProg) {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    console.log(`[Auto-Sync][Group:${groupName}] Starting ${groupConfig.tfs.join(',')}...`);
    
    const SYNC_BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || '5');
    const groupResults = {}; // { tf: [...signals] }
    
    // 그룹 내 TF들 병렬 처리
    await Promise.all(groupConfig.tfs.map(async (tf) => {
        const tfResults = [];
        let errorCount = 0;
        let tokenExpiredFlag = false;
        
        for (let batchStart = 0; batchStart < stocks.length; batchStart += SYNC_BATCH_SIZE) {
            const batch = stocks.slice(batchStart, batchStart + SYNC_BATCH_SIZE);
            
            const results = await Promise.allSettled(
                batch.map(stock => 
                    fetchHybridHistoryForTf(stock, tf, kisTokenGlobal, kisSharedCache)
                )
            );
            
            results.forEach((result, idx) => {
                if (result.status === 'fulfilled' && result.value) {
                    const history = result.value;
                    if (history.close?.length > 50) {
                        const signal = calculateSignals(history, tf);
                        if (signal) {
                            const stock = batch[idx];
                            tfResults.push({
                                ...signal,
                                code: stock.code,
                                name: stock.name,
                                timeframe: tf,
                                timestamp: Date.now(),
                                id: uuidv4(),
                                kis_change_data: history.kis_change_data
                            });
                        }
                    }
                } else {
                    const err = result.reason;
                    if (err?.type === 'TOKEN_EXPIRED') {
                        tokenExpiredFlag = true;
                    } else {
                        errorCount++;
                    }
                }
            });

            // 토큰 만료 처리
            if (tokenExpiredFlag) {
                console.log(`[Auto-Sync][${tf}] Token expired, refreshing...`);
                kisTokenGlobal = await getKisAccessToken(true);
                tokenExpiredFlag = false;
            }
            
            // 진행률 업데이트
            const processed = Math.min(batchStart + SYNC_BATCH_SIZE, stocks.length);
            if (Math.floor(batchStart / SYNC_BATCH_SIZE) % 10 === 0) {
                emitProg(processed, stocks.length, tf, groupName);
            }

            await sleep(groupConfig.sleep * SYNC_BATCH_SIZE);
        }
        
        groupResults[tf] = tfResults;
        emitProg(stocks.length, stocks.length, tf, groupName);
        console.log(`[Auto-Sync][${tf}] Done. Signals: ${tfResults.length}, Errors: ${errorCount}`);
    }));
    
    return groupResults;
}

// [OPT-08] Yahoo Finance 요청 지수 백오프 재시도 유틸리티
const fetchYahooWithRetry = async (url, retries = 5) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                signal: AbortSignal.timeout(8000) // 8초 타임아웃
            });
            if (response.ok) return response;
            if ((response.status === 429 || response.status >= 500) && attempt < retries) {
                await sleep(2000 * (attempt + 1)); 
                continue;
            }
            throw new Error(`Yahoo ${response.status}`);
        } catch (e) {
            if (attempt < retries) {
                await sleep(1000 * (attempt + 1));
                continue;
            }
            throw e;
        }
    }
};

// [OPT-03/08] 타임프레임별 하이브리드 데이터 수집 함수
const fetchHybridHistoryForTf = async (stock, currentTf, kisTokenGlobal, kisSharedCache) => {
    const intervalMap = { '30M': '30m', '1H': '1h', '2H': '1h', '4H': '1h', '1D': '1d', '2D': '1d', '1W': '1wk' };
    const daysMap = { '30M': 30, '1H': 60, '2H': 90, '4H': 120, '1D': 365, '2D': 730, '1W': 1000 };
    
    const interval = intervalMap[currentTf] || '1d';
    const days = daysMap[currentTf] || 90;
    
    const suffix = stock.market && stock.market.includes('KOSPI') ? '.KS' : '.KQ';
    const symbolKS = stock.code + suffix;
    const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolKS}?period1=${period1}&period2=${period2}&interval=${interval}`;
    
    // [OPT-08] Yahoo Retry 적용
    const response = await fetchYahooWithRetry(url);
    const data = await response.json();
    if (!data.chart?.result?.[0]) throw new Error('Yahoo Response format error');
    
    const result = data.chart.result[0];
    const quotes = result.indicators.quote[0];
    const timestamps = result.timestamp || [];
    
    let validIndices = [];
    if (quotes.close) {
        for (let i = 0; i < quotes.close.length; i++) {
            if (quotes.close[i] !== null && timestamps[i] !== null) validIndices.push(i);
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

    // KIS 캐시 결합
    if (kisSharedCache && kisSharedCache[stock.code]) {
        const kis = kisSharedCache[stock.code];
        const kisData = kis.price;
        if (kisData && kisData.stck_prpr) {
            let currentPrice = parseInt(kisData.stck_prpr);
            let currentHigh = parseInt(kisData.stck_hgpr);
            let currentLow = parseInt(kisData.stck_lwpr);
            
            // [v9.2.0] 장후 시간외 가격 반영
            const kstNow = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
            const kstHour = kstNow.getUTCHours();
            const overtimePrice = parseInt(kisData.ovtm_untp_prpr || 0);
            
            if (kstHour >= 16 && kstHour <= 20 && overtimePrice > 0) {
                currentPrice = overtimePrice;
            }

            chartData.kis_change_data = {
                sign: kisData.prdy_vrss_sign,
                change: parseInt(kisData.prdy_vrss),
                rate: parseFloat(kisData.prdy_ctrt),
                trade_amount: parseInt(kisData.acml_tr_pbmn),
                acml_vol: parseInt(kisData.acml_vol || 0),
                vol_rate: parseFloat(kisData.prdy_vol_vrss_rt || 0),
                foreign_buy: kis.foreign_buy || 0,
                inst_buy: kis.inst_buy || 0,
                person_buy: kis.person_buy || 0,
                stck_prpr: currentPrice
            };

            const lastIdx = chartData.close.length - 1;
            if (lastIdx >= 0) {
                chartData.close[lastIdx] = currentPrice;
                chartData.high[lastIdx] = Math.max(chartData.high[lastIdx], currentHigh);
                chartData.low[lastIdx] = Math.min(chartData.low[lastIdx], currentLow);
            }
        }
    }

    // 리샘플링 (2H, 4H, 2D)
    if (currentTf === '2H') return resampleChartData(chartData, 2, '2H');
    if (currentTf === '4H') return resampleChartData(chartData, 4, '4H');
    if (currentTf === '2D') return resampleChartData(chartData, 2, '2D');
    
    return chartData;
};

// ─────────────────────────────────────────────────
// [SSOT-01] 자동 동기화 분석 및 스냅샷 저장
// ─────────────────────────────────────────────────
app.post('/api/auto-sync', async (req, res) => {
    // 1. Auth Guard
    let isAllowed = false;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.cookies?.accessToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            if (['ADMIN', 'PAID', 'PRO_USER'].includes(decoded.role)) isAllowed = true;
        } catch(e) {}
    }
    const CRON_SECRET = process.env.CRON_SECRET;
    const isLocalCron = CRON_SECRET && req.headers['x-internal-cron-secret'] === CRON_SECRET;
    if (!isAllowed && !isLocalCron) return res.status(403).json({ error: '권한이 없습니다.' });

    if (isSyncMutexLocked) return res.status(409).json({ error: '동기화 진행 중입니다.' });

    try {
        isSyncMutexLocked = true;
        const { timeframe, timeframes } = req.body;
        const tfList = Array.isArray(timeframes) && timeframes.length > 0 ? timeframes : [(timeframe || '1D')];
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // [OPT-09-UI] Progress helper moved up for early feedback
        const emitProg = (cur, tot, t, group = '') => {
            currentSyncProgress = { current: cur, total: tot, timeframe: t, group };
            const pct = Math.round((cur / tot) * 100);
            const p = `data: ${JSON.stringify({ 
                type: 'sync_progress', 
                payload: { current: cur, total: tot, timeframe: t, group, pct } 
            })}\n\n`;
            // [Red Team Fix - R1] destroyed 클라이언트 체크 강화
            clients.forEach(c => { 
                if (c.destroyed || c.writableEnded) return;
                try { c.write(p); if(c.flush) c.flush(); } catch(e) {} 
            });
        };

        // 초기 진행률 공지 (준비 중)
        emitProg(0, 100, '데이터 준비 중...');

        // [Step 0] KIS Cache Prefetch
        let kisTokenGlobal = await getKisAccessToken().catch(() => null);
        const stocksRaw = await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8');
        const stocks = JSON.parse(stocksRaw);
        
        const KIS_PREFETCH_BATCH_SIZE = process.env.KIS_PREFETCH_BATCH_SIZE || '3';
        const KIS_PREFETCH_BATCH_DELAY_MS = process.env.KIS_PREFETCH_BATCH_DELAY_MS || '600';

        const kisSharedCache = await prefetchKisCache(stocks, kisTokenGlobal, {
            KIS_APP_KEY, KIS_APP_SECRET, kisCircuit, saveCircuitState, sleep,
            KIS_PREFETCH_BATCH_SIZE, KIS_PREFETCH_BATCH_DELAY_MS
        }, (cur, tot, msg) => {
            emitProg(cur, tot, msg, '데이터 수집');
        });

        // [Feature Flag] 최적화 모드 사용 여부 (OPT-03/09/Rollback)
        const useOptimizedSync = process.env.SYNC_USE_OPTIMIZED !== 'false';
        let allSyncResults = [];

        if (useOptimizedSync) {
            console.log('[Auto-Sync] Using OPTIMIZED parallel engine');
            // [OPT-03] TF 그룹 분류 및 병렬 실행
            const activeGroups = classifyTfGroups(tfList);
            const phase1Groups = ['DAILY', 'HOURLY'].filter(g => activeGroups[g]);
            let phase1Results = {};
            if (phase1Groups.length > 0) {
                const phase1Promises = phase1Groups.map((g, idx) => {
                    // [RL-03] 그룹 간 100ms 스태거링 적용
                    const offset = idx * 100;
                    return (async () => {
                        if (offset > 0) await sleep(offset);
                        return runTfGroup(g, activeGroups[g], stocks, kisSharedCache, kisTokenGlobal, emitProg);
                    })();
                });
                const phase1Raw = await Promise.all(phase1Promises);
                phase1Raw.forEach((res) => Object.assign(phase1Results, res));
                console.log('[Auto-Sync] Phase 1 (DAILY+HOURLY) complete.');
            }

            let phase2Results = {};
            if (activeGroups['INTRA']) {
                phase2Results = await runTfGroup('INTRA', activeGroups['INTRA'], stocks, kisSharedCache, kisTokenGlobal, emitProg);
                console.log('[Auto-Sync] Phase 2 (INTRA) complete.');
            }
            allSyncResults = Object.values({ ...phase1Results, ...phase2Results }).flat();
        } else {
            console.log('[Auto-Sync] Using LEGACY sequential engine (Rollback Mode)');
            // [Rollback] 레거시 순차 처리 (OPT-02 배치 병렬은 유지하되 TF만 순차)
            for (const tf of tfList) {
                const tfRes = await runTfGroup(tf, { tfs: [tf], sleep: 350 }, stocks, kisSharedCache, kisTokenGlobal, emitProg);
                allSyncResults.push(...(tfRes[tf] || []));
            }
        }

        // [Step 2] 통합 signals.json 일괄 쓰기 (OPT-04)
        if (allSyncResults.length > 0) {
            const allNewSignalsMap = new Map();
            allSyncResults.forEach(signal => {
                allNewSignalsMap.set(`${signal.code}_${signal.timeframe}`, signal);
            });

            await withSignalLock(async () => {
                // ... (existing code for reading and merging signals)
                let currentSignals = [];
                try {
                    const rawData = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
                    currentSignals = JSON.parse(rawData);
                } catch (e) {
                    currentSignals = [];
                }

                const updatedKeys = new Set(allNewSignalsMap.keys());
                const preserved = currentSignals.filter(s => !updatedKeys.has(`${s.code}_${s.timeframe}`));
                const merged = [...preserved, ...allNewSignalsMap.values()];

                // [FIX-02] 전체 상한 유지 (최대 5000건, 최신순)
                const MAX_SIGNALS = 5000;
                const bounded = merged.length > MAX_SIGNALS
                    ? merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_SIGNALS)
                    : merged;

                const getSignalsForStock = (code) => {
                    const stockSignals = merged.filter(s => s.code === code);
                    const status = {};
                    ["30M", "1H", "2H", "4H", "1D", "2D", "1W"].forEach(targetTf => {
                        status[targetTf] = stockSignals.find(s => s.timeframe === targetTf);
                    });
                    return status;
                };

                const scored = bounded.map(s => {
                    const tfSigs = getSignalsForStock(s.code);
                    const { score } = calculateTotalScore(tfSigs, s);
                    return {
                        ...s,
                        score: score
                    };
                });

                const resultStr = JSON.stringify(scored, null, 2);
                const tmpFile = SIGNALS_FILE + '.tmp';
                await fs.promises.writeFile(tmpFile, resultStr);
                await fs.promises.rename(tmpFile, SIGNALS_FILE);
                
                CACHED_SIGNALS = resultStr;
                lastSignalsMtimeMs = Date.now();
                
                console.log(`[Auto-Sync] Final write: ${scored.length} total signals.`);
            });
            // [TASK-B3] 즉시 브로드캐스트하여 UI 업데이트 유도 (전체 완료 전 중간 다리)
            broadcastUpdate({ type: 'signal_update' });
        }

        // [Step 3] DB 스냅샷 일괄 upsert (PRISMA)
        console.log(`[Auto-Sync] Finalizing persistence...`);
        const currentSignalsRaw = await fs.promises.readFile(SIGNALS_FILE, 'utf8');
        const currentSignals = JSON.parse(currentSignalsRaw);
        
        const getSignalsForStockLocal = (code) => {
            const stockSignals = currentSignals.filter(s => s.code === code);
            const status = {};
            ["30M", "1H", "2H", "4H", "1D", "2D", "1W"].forEach(targetTf => {
                status[targetTf] = stockSignals.find(s => s.timeframe === targetTf);
            });
            return status;
        };

        const snapshotData = stocks.map(stock => {
            const tfSigs = getSignalsForStockLocal(stock.code);
            const sig2H = tfSigs['2H'] || tfSigs['1H'] || tfSigs['4H']; // Fallback
            const latest = Object.values(tfSigs).filter(s => s).sort((a,b)=>b.timestamp-a.timestamp)[0];
            if (!latest) return null;

            const { score } = calculateTotalScore(tfSigs, latest);
            const kis = latest.kis_change_data || {};
            
            const formatSupply = (val) => {
                if (val === null || val === undefined || val === '-') return '-';
                const num = Number(val);
                if (isNaN(num)) return String(val);
                const sign = num > 0 ? '+' : '';
                return `${sign}${num.toLocaleString('ko-KR')}`;
            };

            return {
                ticker: stock.code, name: stock.name,
                category: getCategory(score), hybridScore: score,
                currentPrice: latest.current_price || latest.entry_price || 0,
                entry1Price: sig2H?.result_1 || 0,
                entry2Price: sig2H?.result_2 || 0,
                targetPrice: sig2H?.result_3 || 0,
                stopLossPrice: sig2H?.stop_loss || 0,
                yield: kis.rate || 0,
                tradeAmount: kis.trade_amount ? BigInt(kis.trade_amount) : 0n,
                foreignNet: formatSupply(kis.foreign_buy),
                institutionNet: formatSupply(kis.inst_buy),
                maArrangement: latest.maArrangement || null,
                ma5: latest.sma5 || 0,
                ma10: latest.sma10 || 0,
                ma20: latest.sma20 || 0,
                ma60: latest.sma60 || 0,
                isTop5: true, // [ADD] Auto-sync should also populate SignalBoard
                syncDate: new Date(new Date().setHours(0,0,0,0)) // [ADD]
            };
        }).filter(s => s != null);

        if (snapshotData.length > 0) {
            // [OPT-05] 배치 upsert (Prisma createMany + deleteMany)
            // 오늘 날짜의 기존 레코드를 삭제하고 재삽입하여 정합성 유지
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const UPSERT_BATCH_SIZE = 50;
            const snapshotBatches = [];
            for (let i = 0; i < snapshotData.length; i += UPSERT_BATCH_SIZE) {
                snapshotBatches.push(snapshotData.slice(i, i + UPSERT_BATCH_SIZE));
            }

            // Task 2: Prisma createMany 호출 전 console.log 삽입
            if (snapshotBatches.length > 0 && snapshotBatches[0].length > 0) {
                // [DEBUG] Task 2 필드 매핑 검증
                console.log("[DEBUG] First snapshot sample:", JSON.stringify(snapshotBatches[0][0], (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
            }

            try {
                // [v9.5.0] STEP-04: 연쇄 삭제 방지 및 수동값 보호를 위해 BulkSyncService 통합
                const syncResult = await BulkSyncService.bulkUpsertSnapshots(snapshotData);
                if (syncResult.success) {
                    console.log(`[Auto-Sync] DB upsert complete via BulkSyncService: ${syncResult.success} records`);
                } else {
                    console.error('[Auto-Sync] DB Persistence Partically Failed:', syncResult.error);
                }
            } catch (dbErr) {
                console.error('[Auto-Sync] DB unreachable. Entering Safe Mode (Skipping DB Persistence). Error:', dbErr.message);
            }
            
            // Latest.json update for landing page
            const VIP_LOGS_DIR = path.join(__dirname, 'data/vip_logs');
            if (!fs.existsSync(VIP_LOGS_DIR)) fs.mkdirSync(VIP_LOGS_DIR, { recursive: true });
            const payload = {
                stocks: snapshotData.slice(0, 10).map(s => ({ ...s, stars: getStars(s.score) })),
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(path.join(VIP_LOGS_DIR, 'latest.json'), JSON.stringify(payload, null, 2));
        }

        emitProg(stocks.length, stocks.length, "전체완료");
        res.json({ success: true, count: allSyncResults.length });

    } catch (err) {
        console.error('[Auto-Sync] Global Error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    } finally {
        isSyncMutexLocked = false;
        clients.forEach(c => { try { c.write(`data: ${JSON.stringify({ type: 'sync_complete' })}\n\n`); if (c.flush) c.flush(); } catch(e) {} });
    }
});

/**
 * [TASK-E2] 동기화 저장 엔드포인트 (server.cjs)
 * 역할: 분석 완료된 데이터를 DB에 원자적으로 저장하고 전 클라이언트에 브로드캐스트
 */
/**
 * [v9.4.16] Unified Sync Save Endpoint
 * Handles individual snapshot updates and historical tag creation.
 */
app.post(['/api/save-sync', '/api/admin/save-sync-history'], authenticateToken, async (req, res) => {
  const startTime = Date.now();
  console.log('[SaveSync] ▶ 동기화 저장 시작...');

  try {
    // 1. signals.json에서 최신 분석 결과 로드
    const rawSignals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf-8'));
    
    // 2. 전체 저장 결과 추적
    const saveResults = {
      success: [],
      failed:  [],
      skipped: [],
    };

    // 3. Top5 선정 (하이브리드 점수 기준 상위 5개)
    const signalArray = Array.isArray(rawSignals) ? rawSignals : Object.values(rawSignals);
    
    const rankedTickers = signalArray
      .map(s => ({
        ticker: s.code || s.ticker,
        score: Number(s.hybridScore ?? s.score?.total ?? s.score ?? 0),
      }))
      .sort((a, b) => b.score - a.score);

    // [v9.3.4] 중복 제거된 티커 목록 추출 (여러 타임프레임 대응)
    const uniqueRanked = [];
    const seenTickers = new Set();
    for (const item of rankedTickers) {
        if (item.ticker && !seenTickers.has(item.ticker)) {
            seenTickers.add(item.ticker);
            uniqueRanked.push(item);
        }
    }

    const top5Tickers = new Set(uniqueRanked.slice(0, 5).map(t => t.ticker));
    console.log('[SaveSync] Top5 선정:', [...top5Tickers].join(', '));

    // 4. 종목별 DB 원자 저장
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // signals.json이 배열인 경우와 객체인 경우 모두 대응
    const signalEntries = Array.isArray(rawSignals) 
        ? rawSignals.reduce((acc, s) => { acc[s.code] = s; return acc; }, {})
        : rawSignals;

    for (const [ticker, signalData] of Object.entries(signalEntries)) {
      try {
        // 4-1. 가격 사전 검증 및 52주 범위 자동 조정
        const validatedData = await preValidateAndAdjust(ticker, signalData);
        
        // 4-2. 순위 계산
        const rankIndex = uniqueRanked.findIndex(t => t.ticker === ticker);
        const rank = top5Tickers.has(ticker) ? rankIndex + 1 : null;

        // 4-3. upsert (동일 날짜 있으면 update, 없으면 create)
        // schema.prisma의 ticker_syncDate 유니크 제약 조건 필수
        const snapshot = await prisma.dailyStockSnapshot.upsert({
          where: {
            ticker_syncDate: { ticker, syncDate: today },
          },
          create: buildSnapshotPayload(ticker, validatedData, rank, today),
          update: buildSnapshotPayload(ticker, validatedData, rank, today),
        });

        // 4-4. Redis 캐시 갱신 (개별 종목)
        if (redis) {
            await redis.set(
              `mp:signal:${ticker}`,
              JSON.stringify(snapshot),
              'EX', 1800
            );
        }

        // 4-5. Top5 캐시 무효화 (재생성 트리거)
        if (top5Tickers.has(ticker) && redis) {
          await redis.del('mp:top:5');
          await redis.del('mp:top:10');
        }

        saveResults.success.push(ticker);
        console.log(`[SaveSync] ✅ ${ticker} 저장 완료 (rank: ${rank ?? '-'})`);

      } catch (err) {
        saveResults.failed.push({ ticker, reason: err.message });
        console.error(`[SaveSync] ❌ ${ticker} 저장 실패:`, err.message);
      }
    }

    // 5. 저장 완료 후 SSE 브로드캐스트
    broadcastUpdate({
      type:    'save_sync_complete',
      status:  'done',
      top5:    [...top5Tickers],
      results: saveResults,
      savedAt: new Date().toISOString(),
    });

    const elapsed = Date.now() - startTime;
    console.log(`[SaveSync] ▶ 완료. 성공: ${saveResults.success.length}, 실패: ${saveResults.failed.length} (${elapsed}ms)`);

    // 6. [v9.4.16] Create Historical Snapshot (SyncSaveLog)
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const pad = (n) => n.toString().padStart(2, '0');
    const tagName = `${kstNow.getUTCFullYear()}-${pad(kstNow.getUTCMonth() + 1)}-${pad(kstNow.getUTCDate())} ${pad(kstNow.getUTCHours())}:${pad(kstNow.getUTCMinutes())}`;

    // Normalize Top5 for historical snapshot
    const historicalTop5 = Array.from(top5Tickers).map(ticker => {
        const s = signalEntries[ticker];
        const rt = redis ? null : null; // Logic to grab from redis could go here
        
        // Use the buildSnapshotPayload logic or direct mapping
        // Standardize fields for DailySnapshotAnalytics.jsx
        return {
            ticker,
            name: s.name || ticker,
            score: s.hybridScore ?? s.score ?? 0,
            currentPrice: Math.round(s.current_price || s.entry_price || 0),
            entryPrice1: Math.round(s.result_2 || s.entry_price || 0),
            entryPrice2: Math.round(s.result_3 || 0),
            targetPrice: Math.round(s.result_1 || s.bb_upper || 0),
            stopLossPrice: Math.round(s.stop_loss || 0),
            category: s.category || '기타',
            yield: s.kis_change_data?.rate || 0
        };
    });

    try {
        await prisma.syncSaveLog.create({
            data: {
                tagName,
                snapshot: JSON.parse(JSON.stringify(historicalTop5))
            }
        });
        console.log(`[SaveSync] 📜 히스토리 로그 생성 완료: ${tagName}`);
    } catch (logErr) {
        console.error('[SaveSync] ❌ 히스토리 로그 저장 실패:', logErr.message);
    }

    return res.json({
      ok:      true,
      success: saveResults.success.length,
      failed:  saveResults.failed,
      top5:    [...top5Tickers],
      tagName,
      elapsed,
    });

  } catch (fatalErr) {
    console.error('[SaveSync] 치명적 오류:', fatalErr);
    return res.status(500).json({ ok: false, error: fatalErr.message });
  }
});

// ─── [TASK-E2] SaveSync 헬퍼 함수 ──────────────────────────────────────────────

/**
 * signals.json 데이터를 DailyStockSnapshot 페이로드로 변환
 */
function buildSnapshotPayload(ticker, data, rank, syncDate) {
  return {
    ticker,
    syncDate,
    name:           data.name || 'Unknown',
    currentPrice:   Math.round(Number(data.currentPrice ?? data.current_price ?? 0)),
    entry1Price:    Math.round(Number(data.result_2   ?? data.entry1  ?? 0)),
    entry2Price:    Math.round(Number(data.result_3   ?? data.entry2  ?? 0)),
    targetPrice:    Math.round(Number(data.result_1   ?? data.target  ?? 0)),
    stopLossPrice:  Math.round(Number(data.stop_loss  ?? data.stopLoss ?? 0)),
    hybridScore:    Math.round(Number(data.hybridScore ?? data.score ?? 0)),
    starRating:     computeStarRating(Number(data.hybridScore ?? data.score ?? 0)),
    maArrangement:  data.maArrangement || data.maArray?.arrangement || null,
    ma5:            Math.round(Number(data.sma5 || data.maArray?.ma5   || data.ma5 || 0)),
    ma10:           Math.round(Number(data.sma10 || data.maArray?.ma10  || data.ma10 || 0)),
    ma20:           Math.round(Number(data.sma20 || data.maArray?.ma20  || data.ma20 || 0)),
    ma60:           Math.round(Number(data.sma60 || data.maArray?.ma60  || data.ma60 || 0)),
    ma120:          Math.round(Number(data.maArray?.ma120 || data.ma120 || 0)),
    yield:          Number(data.changeRate || data.yield || 0),
    tradeAmount:    (() => {
        const val = String(data.tradeAmount || data.trade_amount || 0).replace(/[^0-9]/g, '');
        return val ? BigInt(val) : 0n;
    })(),
    foreignNet:     formatSupply(data.foreignNet     ?? data.foreign_net ?? data.foreignBuy),
    institutionNet: formatSupply(data.institutionNet ?? data.inst_net ?? data.instBuy),
    category:       data.category || data.trendType || null,
    signalVersion:  data.version || 'v10.0.0-SSOT',
    isTop5:         rank !== null,
    rank:           rank,
  };
}

function formatSupply(value) {
  if (value === null || value === undefined || value === '-') return null;
  const num = Number(String(value).replace(/,/g, ''));
  if (isNaN(num)) return String(value);
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toLocaleString('ko-KR')}`;
}

function computeStarRating(score) {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 45) return 3;
  if (score >= 30) return 2;
  if (score >= 15) return 1;
  return 0;
}

async function preValidateAndAdjust(ticker, data) {
  const price   = Number(data.currentPrice ?? data.current_price ?? 0);
  // signals.json에 52주 정보가 없을 경우 fallback
  const high52  = Number(data.high52w ?? data.high_52w ?? price * 1.5);
  const low52   = Number(data.low52w  ?? data.low_52w  ?? price * 0.5);

  const adjusted = { ...data };

  if (price > high52 && price > 0) {
    console.warn(`[Validate] ${ticker}: price(${price}) > high52w(${high52}) → 자동 확장`);
    adjusted.high52w = Math.ceil(price * 1.10);
    // [v9.3.4] DB StockMeta도 업데이트 (비동기 처리)
    prisma.stockMeta?.updateMany({
      where: { ticker },
      data:  { high_52w: adjusted.high52w, updatedAt: new Date() },
    }).catch(() => {}); 
  }

  if (price > 0 && price < low52) {
    console.warn(`[Validate] ${ticker}: price(${price}) < low52w(${low52}) → 자동 조정`);
    adjusted.low52w = Math.floor(price * 0.90);
  }

  return adjusted;
}

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
                await refreshCacheNow();
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

    // [v7.4.1] Morning Cron Removed per user request. Holiday logic moved to marketHours.cjs.

    cron.schedule(process.env.ARCHIVE_CRON_TIME || '0 2 * * *', () => archiveOldSignals(), { timezone: "Asia/Seoul" });

    cron.schedule('0 21 * * 1-5', async () => {
        if (!isTradingDay()) {
            console.log('[Cron] Today is a holiday. Skipping 21:00 batch.');
            return;
        }
        console.log('[Cron] 자동 종목 발굴 및 텔레그램 발송 시작...');
        try {
            const dateStr = getKSTDateString(); // [TASK-CC02] 공통 유틸 사용
            
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
            const stocksRaw = await fs.promises.readFile(STOCK_MASTER_FILE, 'utf8');
            const stocks = JSON.parse(stocksRaw);

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
            const kstNow = toKST();
            const isFriday = kstNow.getDay() === 5;
            const tomorrow = new Date(kstNow.getTime() + 24 * 60 * 60 * 1000);
            const isEndOfMonth = tomorrow.getMonth() !== kstNow.getMonth();

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
                  { 
                    timeout: 30000,
                    headers: { 'x-internal-api-key': process.env.INTERNAL_API_SECRET || 'fallback_secret' } // [TASK-CC01] 내부 인증 헤더 추가
                  } 
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
                    if (aiScoringQueue) {
                      aiScoringQueue.add('scorePredict', {
                        candidateId: approval.candidateId || s.code,
                        symbol: s.code,
                        category: s.latestSignal.category,
                        indicators: {
                          score: score,
                          adx: s.latestSignal.adx || 0
                        }
                      }, { removeOnComplete: true, removeOnFail: 1000 }).catch(err => console.error('[BullMQ] Queue Add Error:', err));
                    } else {
                      console.warn(`[BullMQ] AI Scoring Queue is not initialized. Skipping job push for ${s.code}`);
                    }
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
                const snapshotData = candidates.map((s, idx) => {
                    const sig2H = s.timeframeStatus['2H'];
                    const curPrice = Number(s.latestSignal?.current_price || s.latestSignal?.entry_price || 0);
                    return {
                        ticker: s.code,
                        name: s.name,
                        isTop5: idx < 5,
                        rank: idx + 1,
                        category: getCategory(s.total_score),
                        hybridScore: Math.round(Number(s.total_score || 0)),
                        adx: Math.round(Number(s.latestSignal?.adx || 0)),
                        currentPrice: Math.round(curPrice),
                        entry1Price: Math.round(Number(sig2H?.result_2 || 0)),
                        entry2Price: Math.round(Number(sig2H?.result_3 || 0)),
                        targetPrice: Math.round(Number(sig2H?.bb_upper || 0)),
                        stopLossPrice: Math.round(Number(sig2H?.stop_loss || 0)),
                        
                        // MA SSOT Alignment
                        maArrangement: sig2H?.maArrangement || null,
                        ma5: Math.round(Number(sig2H?.sma5 || 0)),
                        ma10: Math.round(Number(sig2H?.sma10 || 0)),
                        ma20: Math.round(Number(sig2H?.sma20 || 0)),
                        ma60: Math.round(Number(sig2H?.sma60 || 0)),
                        ma120: Math.round(Number(sig2H?.sma120 || 0)),
                        
                        yield: Number(s.latestSignal?.kis_change_data?.rate || 0),
                        tradeAmount: (() => {
                            const val = String(s.latestSignal?.kis_change_data?.trade_amount || 0).replace(/[^0-9]/g, '');
                            return val ? BigInt(val) : 0n;
                        })(),
                        foreignNet: String(s.latestSignal?.kis_change_data?.foreign_buy || '-'),
                        institutionNet: String(s.latestSignal?.kis_change_data?.inst_buy || '-')
                    };
                });
                
                // [TASK-S09] deleteMany + createMany transaction for reliable updates
                const todayStr = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
                const todayStart = toKSTMidnight(todayStr);
                const todayEnd = toKSTMidnight(todayStr, true);

                await prisma.$transaction([
                    prisma.dailyStockSnapshot.deleteMany({
                        where: {
                            createdAt: { gte: todayStart, lte: todayEnd },
                            ticker: { in: snapshotData.map(s => s.ticker) }
                        }
                    }),
                    prisma.dailyStockSnapshot.createMany({ data: snapshotData })
                ]);
                console.log(`[Cron] Successfully persisted ${snapshotData.length} records to DB (Upsert Pattern).`);
            } catch (snapErr) {
                console.error('[Cron] Snapshot Persistence Error:', snapErr);
            }

            // [TASK-S06] Telegram 메시지 분할 기준 오류 수정 (Buffer 기반 바이트 길이 계산)
            const MAX_TG_BYTES = 4000; // API 제한 4096보다 넉넉하게 설정
            const chunks = [];
            let currentChunk = "";
            let currentBytes = 0;

            const lines = content.split('\n');
            for (const line of lines) {
                const lineWithNewline = line + '\n';
                const lineBytes = Buffer.from(lineWithNewline).length;

                if (currentBytes + lineBytes > MAX_TG_BYTES) {
                    if (currentChunk) {
                        chunks.push(currentChunk);
                        currentChunk = "";
                        currentBytes = 0;
                    }

                    // 한 줄 자체가 제한을 초과하는 경우 바이트 단위로 분할
                    if (lineBytes > MAX_TG_BYTES) {
                        let remainingLine = lineWithNewline;
                        while (Buffer.from(remainingLine).length > 0) {
                            let charCount = 0;
                            let sliceSize = 0;
                            while (charCount < remainingLine.length) {
                                const charBytes = Buffer.from(remainingLine[charCount]).length;
                                if (sliceSize + charBytes > MAX_TG_BYTES) break;
                                sliceSize += charBytes;
                                charCount++;
                            }
                            chunks.push(remainingLine.substring(0, charCount));
                            remainingLine = remainingLine.substring(charCount);
                        }
                    } else {
                        currentChunk = lineWithNewline;
                        currentBytes = lineBytes;
                    }
                } else {
                    currentChunk += lineWithNewline;
                    currentBytes += lineBytes;
                }
            }
            if (currentChunk) chunks.push(currentChunk);

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
