const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { saveDailyTop5, clearDailyTop5 } = require('./signalReportService.cjs');
const lockManager = require('../utils/lockManager.cjs');
const redis = require('../../platform/infra/redis/client.cjs'); // [v9.1.8] Added for cache invalidation
const { getKSTDateString, getKstNow } = require('../utils/kst.cjs');
const telegramService = require('./telegramService.cjs');

/**
 * [v9.1.5] Publishing Service - Multi-Channel Synchronization SSOT
 */
class PublishingService {
    constructor() {
        this.LANDING_FILE = path.join(process.cwd(), 'data', 'landing_strategy.json');
        this.WATCHLIST_FILE = path.join(process.cwd(), 'data', 'watchlist_strategy.json');
        this.LATEST_FILE = path.join(process.cwd(), 'data', 'vip_logs', 'latest.json');
    }

    /**
     * Publish Top 5 stocks to all channels atomically
     * @param {Array} top5 - The selected Top 5 stocks from dashboard
     */
    async publishToAll(inputStocks) {
        console.log('[PublishingService] Starting multi-channel sync...');
        
        // [v9.4.18] Deduplicate stocks by code and enforce strict Top 5 limit
        const uniqueStocks = [];
        const seenCodes = new Set();
        (inputStocks || []).forEach(s => {
            const code = s.code || s.ticker;
            if (code && !seenCodes.has(code)) {
                seenCodes.add(code);
                uniqueStocks.push(s);
            }
        });
        const top5 = uniqueStocks.slice(0, 5);

        try {
            const kstNow = getKstNow();
            const todayStr = getKSTDateString(kstNow); // "2026-04-11"
            
            // [TASK-P07] Time boundary fix: derive displayDate from KST string
            const dateParts = todayStr.split('-');
            const displayDate = `${parseInt(dateParts[1])}. ${parseInt(dateParts[2])}.`;

            // 1. Smart-Merge Existing Status (Red Team Recommendation)
            // Fetch existing data to preserve "Executed/Target Reached" statuses
            const existingLatest = this.readJsonSafe(this.LATEST_FILE);
            const statusMap = {};
            if (existingLatest && existingLatest.stocks) {
                existingLatest.stocks.forEach(s => {
                    if (s.code) statusMap[s.code] = s.status;
                });
            }

            const processedStocks = top5.map(s => {
                const stockCode = s.code || s.ticker;
                const currentStatus = statusMap[stockCode] || s.status || '분석완료';
                const status = (['보유 중', '목표 도달', '손절 완료', '체결'].includes(currentStatus)) ? currentStatus : '분석완료';
                
                // [v9.5.9] Standardized field aliases for CSS/LandingPage compatibility
                const nEntry1 = this.parsePrice(s.entry1Price || s.entryPrice1 || s.entry_price || s.entry1 || 0);
                const nEntry2 = this.parsePrice(s.entry2Price || s.entryPrice2 || s.entry_price_2 || s.entry2 || s.result_3 || 0);
                const nTarget = this.parsePrice(s.targetPrice1 || s.targetPrice || s.target_price || s.target || s.result_1 || 0);
                const nSL     = this.parsePrice(s.stopLossPrice || s.stopLoss || s.stop_loss || s.sl || 0);
                const nCurrent = this.parsePrice(s.currentPrice || s.current_price || 0);

                return {
                    code: stockCode,
                    name: s.name,
                    score: s.score || s.total_score || 0,
                    category: s.category || '추세 지속형',
                    // Aliased fields for robust frontend mapping
                    currentPrice: nCurrent,
                    current_price: nCurrent,
                    entryPrice1: nEntry1,
                    entry1Price: nEntry1,
                    entry1: nEntry1,
                    entryPrice2: nEntry2,
                    entry2Price: nEntry2,
                    entry2: nEntry2,
                    stopLoss: nSL,
                    stopLossPrice: nSL,
                    sl: nSL,
                    targetPrice1: nTarget,
                    targetPrice: nTarget,
                    target: nTarget,
                    yield: this.parseRate(s.yield || s.yield_pct || s.change_rate),
                    status,
                    recommended_at: displayDate,
                    styleTag: s.styleTag || s.style_tag || '',
                    aiComment: s.aiComment || s.ai_comment || '',
                    adx: Math.round(s.adx || 0),
                    tradeAmount: s.tradeAmount || s.trade_amount || 0,
                    foreignBuy: s.foreignBuy || s.foreign_buy || 0,
                    instBuy: s.instBuy || s.inst_buy || 0,
                    volRate: this.parseRate(s.volRate || s.vol_rate)
                };
            });

            // 2. DB Update (DailyTop5) - Transactional & Atomic (Red Team Hardened)
            console.log('[PublishingService] Performing transactional DB sync...');
            
            // [v9.4.7] Safe Mode: Check connection before proceeding
            let dbSyncEnabled = true;
            try {
                await Promise.race([
                    prisma.$connect(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Connect Timeout')), 2000))
                ]);
            } catch (connErr) {
                console.warn(`[PublishingService] DB unreachable (${connErr.message}). Entering Safe Mode (Skipping DB Persistence).`);
                dbSyncEnabled = false;
            }

            if (dbSyncEnabled) {
                try {
                    await prisma.$transaction(async (tx) => {
                        // 2.1 Strict KST Purge: Remove all existing records for today to prevent accumulation
                        await clearDailyTop5(todayStr, tx);
                        console.log(`[PublishingService] Purged DailyTop5 for ${todayStr}`);

                        // 2.2 Re-insert the definitive Top 5
                        for (const s of processedStocks) {
                            await saveDailyTop5(s.code, {
                                ...s,
                                changeRate: s.yield,
                                trendType: s.category
                            }, todayStr, tx); // Pass transaction client

                            // Mandatory Snapshot for SSOT
                            console.log(`[PublishingService] Creating Snapshot for ${s.code}...`);
                            const snapshotPayload = {
                                ticker: s.code,
                                name: s.name,
                                category: s.category || '기타',
                                hybridScore: Math.round(s.score || s.total_score || 0) || 0,
                                currentPrice: s.currentPrice || 0,
                                entry1Price: s.entryPrice1 || 0,
                                entry2Price: s.entryPrice2 || 0,
                                stopLossPrice: s.stopLoss || 0,
                                targetPrice: s.targetPrice1 || 0,
                                yield: s.yield || 0,
                                tradeAmount: (() => {
                                    const val = String(s.tradeAmount || 0).replace(/[^0-9]/g, '');
                                    // [TASK-P03] BigInt 대용 정밀도 손실 방지 (10조 단위 대응)
                                    try {
                                        return val ? BigInt(val) : 0n;
                                    } catch (e) {
                                        console.warn(`[PublishingService] BigInt conversion failed for ${val}, falling back to Number`);
                                        return val ? Number(val) : 0;
                                    }
                                })(),
                                foreignNet: String(s.foreignBuy || 0),
                                institutionNet: String(s.instBuy || 0), // Use institutionNet to match schema
                                aiComment: s.aiComment || '',
                                isTop5: true, // [ADD] SignalBoard visibility
                                syncDate: new Date(new Date().setHours(0,0,0,0)), // [ADD] Truncated date for query consistency
                                createdAt: new Date()
                            };
                            
                            try {
                                await tx.dailyStockSnapshot.upsert({
                                    where: {
                                        ticker_syncDate: {
                                            ticker: snapshotPayload.ticker,
                                            syncDate: snapshotPayload.syncDate
                                        }
                                    },
                                    update: snapshotPayload,
                                    create: snapshotPayload
                                });
                            } catch (snapErr) {
                                console.error(` [PublishingService] Snapshot FAILED for ${snapshotPayload.ticker}:`, snapErr.message);
                            }
                        }
                    });
                    console.log('[PublishingService] DB Transaction committed successfully.');
                } catch (dbErr) {
                    // [TASK-P08] Fail-fast: Stop propagation if DB fails to maintain SSOT integrity
                    console.error('[PublishingService] DB Sync FAILED. Aborting File/Redis updates.');
                    const adminId = (process.env.TELEGRAM_CHAT_ID || '').split(',')[0];
                    if (adminId) {
                        await telegramService.sendMessage(adminId, `🚨 [PublishingService] DB Sync FAILED: ${dbErr.message}\nJSON/Redis sync aborted to prevent SSOT divergence.`);
                    }
                    throw dbErr; // Stop execution
                }
            } else {
                console.log('[PublishingService] Safe Mode ACTIVE: Skipping DB updates to maintain availability.');
            }

            // 3. File Updates with Mutex & Atomic Rename (Red Team Recommendation)
            await lockManager.withLock('publish_sync', async () => {
                // 3.1 landing_strategy.json
                const landingData = {
                    updatedAt: kstNow.toISOString(),
                    stocks: processedStocks.map(s => ({
                        code: s.code,
                        name: s.name,
                        score: s.score || s.total_score || 0,
                        category: s.category || '추세 지속형',
                        // [v9.5.9] Detailed price fields for LandingPage.jsx compatibility
                        entryPrice: s.entryPrice1 || 0,
                        entryPrice1: s.entryPrice1 || 0,
                        entryPrice2: s.entryPrice2 || 0,
                        targetPrice: s.targetPrice1 || 0,
                        targetPrice1: s.targetPrice1 || 0,
                        stopLoss: s.stopLoss || 0,
                        currentPrice: s.currentPrice || 0,
                        styleTag: s.styleTag || '',
                        aiComment: s.aiComment || '',
                        tradeAmount: s.tradeAmount || 0,
                        yield: s.yield || 0
                    }))
                };
                await this.writeJsonAtomic(this.LANDING_FILE, landingData);

                // 3.2 latest.json (VIP Logs)
                const latestData = {
                    stocks: processedStocks, // Full data for performance page
                    header: {
                        report_date: `${displayDate}.`,
                        universe: 'MP 통합 포트폴리오 (Live)'
                    }
                };
                await this.writeJsonAtomic(this.LATEST_FILE, latestData);

                // 3.3 watchlist_strategy.json — StrategyReportPage.jsx 호환 형식으로 저장 (v9.8.7)
                const watchlistData = {
                    updatedAt: kstNow.toISOString(),
                    version: '9.8.7',
                    source: 'publish',
                    stocks: processedStocks.map(s => ({
                        // 기본 정보
                        id: `ppp-${s.code}`,
                        code: s.code,
                        name: s.name,
                        score: s.score || 0,
                        category: s.category || '추세 지속형',
                        market: 'KR_STOCK',
                        timeframe: 'MTF',
                        // ✅ 신규 필드명 (StrategyReportPage.jsx 요구사항)
                        current_price: s.currentPrice || s.current_price || 0,
                        entry_1: s.entryPrice1 || s.entry1 || 0,
                        entry_2: s.entryPrice2 || s.entry2 || 0,
                        target: s.targetPrice1 || s.target || 0,
                        stop_loss: s.stopLoss || s.stop_loss || 0,
                        // 지표
                        rationale: s.aiComment || '기술적 반등 및 수급 개선 시그널 발생',
                        is_ai_generated: !!(s.aiComment),
                        chartUrl: `https://www.tradingview.com/chart/?symbol=KRX:${s.code}`,
                        metrics: { adx: s.adx || 20, bbw: 100, ma: 'N/A', volTrigger: false },
                        // ✅ 레거시 필드명 (하위 호환)
                        currentPrice: s.currentPrice || 0,
                        entryPrice1: s.entryPrice1 || 0,
                        entryPrice2: s.entryPrice2 || 0,
                        targetPrice1: s.targetPrice1 || 0,
                        stopLoss: s.stopLoss || 0,
                        styleTag: s.styleTag || '',
                        aiComment: s.aiComment || '',
                        tradeAmount: s.tradeAmount || 0,
                        yield: s.yield || 0
                    }))
                };
                await this.writeJsonAtomic(this.WATCHLIST_FILE, watchlistData);

                // 3.4 [v9.1.8] Flush Redis Cache for Landing Page (SSOT Real-time Policy)
                try {
                    // [TASK-P05] Redis del 병렬 처리 적용 (Optimization)
                    await Promise.all([
                        redis.del('mp:top:5'),
                        redis.del('mp:top:10'),
                        redis.del('mp:top:20')
                    ]);
                    console.log('[PublishingService] Redis Caches (mp:top:*) invalidated in parallel.');
                } catch (redisErr) {
                    console.error('[PublishingService] Redis Flush failed:', redisErr.message);
                }
            });

            console.log('[PublishingService] All channels synced successfully.');
            return { success: true, timestamp: kstNow.toISOString() };

        } catch (err) {
            console.error('[PublishingService] Sync FAILED:', err);
            throw err;
        }
    }

    /**
     * [TASK-P01] Write JSON file using Asynchronous Atomic Rename pattern
     */
    async writeJsonAtomic(filePath, data) {
        const tmpPath = `${filePath}.tmp`;
        try {
            console.log(`[PublishingService] Writing async atomic file: ${filePath}`);
            await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
            await fs.promises.rename(tmpPath, filePath);
            console.log(`[PublishingService] File write SUCCESS: ${filePath}`);
        } catch (e) {
            console.error(`[PublishingService] File Write Error (${filePath}):`, e.message);
            if (fs.existsSync(tmpPath)) {
                try { await fs.promises.unlink(tmpPath); } catch(err) {}
            }
            throw new Error(`파일 저장 실패 (${path.basename(filePath)}): ${e.message}`);
        }
    }

    readJsonSafe(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (e) {
            console.warn(`[PublishingService] Read failed for ${filePath}:`, e.message);
        }
        return null;
    }

    /**
     * [TASK-P06] Helper to parse and normalize price-like fields (non-negative)
     */
    parsePrice(val) {
        if (val === undefined || val === null || val === '') return 0;
        const num = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
        return Math.abs(num);
    }

    /**
     * [TASK-P06] Helper to parse and normalize rate-like fields (allows negative)
     */
    parseRate(val) {
        if (val === undefined || val === null || val === '') return 0;
        return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
    }
}

module.exports = PublishingService;
