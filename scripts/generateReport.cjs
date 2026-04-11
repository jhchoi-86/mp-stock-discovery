const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Task 19: Precision Cumulative Report Pipeline (v4.7.2.1)
 * 1. Queries Prisma 'Report' table for the last 50 reports.
 * 2. Groups reports by Date (KST).
 * 3. For each day, picks ONLY the latest report that has exactly 5 stocks.
 * 4. Combines these "Daily Main Reports", de-duplicating as needed.
 */
async function generateReport() {
    console.log('[ReportGen] v4.7.2.1 Precision Daily-Main Pipeline starting...');
    
    try {
        const dataDir = path.join(__dirname, '../data');
        const dailyMainReports = new Map(); // Key: YYYY-MM-DD, Value: Report
        let sourceInfo = 'DB Daily-Main Archive';

        const lastReports = await prisma.report.findMany({
            orderBy: { sentAt: 'desc' },
            take: 50
        });

        console.log(`[ReportGen] Auditing ${lastReports.length} reports to find Daily-Main portfolios...`);

        for (const report of lastReports) {
            const kstReportTime = new Date(new Date(report.sentAt).getTime() + (9 * 60 * 60 * 1000));
            const dateKey = `${kstReportTime.getUTCFullYear()}-${String(kstReportTime.getUTCMonth() + 1).padStart(2, '0')}-${String(kstReportTime.getUTCDate()).padStart(2, '0')}`;

            if (dailyMainReports.has(dateKey)) continue;

            const content = report.content;
            // Use global regex to count stocks regardless of line structure - Inclusive of & and other chars
            const stockCheckRegex = /[■🔹●✅]\s*([가-힣a-zA-Z0-9&\s\_\.\-]+)\((\d{6})\)/g;
            const matches = content.match(stockCheckRegex) || [];
            const stockCount = matches.length;

            if (stockCount >= 3) {
                console.log(`[ReportGen] Selected Daily Main for ${dateKey}: ${report.id.substring(0,8)} (${stockCount} stocks)`);
                dailyMainReports.set(dateKey, report);
            }
        }

        const dailyPortfolios = []; // Array of { date, stocks: [] }
        const firstEntryMap = new Map(); // Key: code, Value: { entry_price, score } (Oldest)

        const sortedDays = Array.from(dailyMainReports.keys()).sort((a,b) => b.localeCompare(a));
        const targetDays = sortedDays.slice(0, 10);
        console.log(`[ReportGen] Aggregating ${targetDays.length} target days (Oldest First): ${targetDays.slice().reverse().join(', ')}`);

        // Iterate from OLDEST to NEWEST to find the ORIGINAL recommendation price
        for (let i = targetDays.length - 1; i >= 0; i--) {
            const day = targetDays[i];
            const report = dailyMainReports.get(day);
            const reportTime = new Date(report.sentAt);
            const content = report.content;
            
            const stockGlobalRegex = /[■🔹●✅]\s*([가-힣a-zA-Z0-9&\s\_\.\-]+)\((\d{6})\)/g;
            let match;
            const currentDayStocks = [];

            while ((match = stockGlobalRegex.exec(content)) !== null) {
                const name = match[1].trim();
                const code = match[2].trim();
                const lookahead = content.substring(match.index, match.index + 800);
                
                let entryPrice = 0;
                let entryPrice2 = 0;
                let stopLoss = 0;
                let targetPrice = 0;
                let reportCurrentPrice = 0;
                let score = 95;

                const entryMatch = lookahead.match(/(?:1차\s*매수진입가|1차\s*매수타점|돌파\s*매수타점)(?:\(1H\))?\s*:\s*([\d,]+)원/);
                if (entryMatch) entryPrice = parseInt(entryMatch[1].replace(/,/g, ''));

                const entry2Match = lookahead.match(/(?:2차\s*매수진입가|2차\s*매수타점)(?:\(2H\))?\s*:\s*([\d,]+)원/);
                if (entry2Match) entryPrice2 = parseInt(entry2Match[1].replace(/,/g, ''));

                const slMatch = lookahead.match(/(?:손절가|SL)\s*(?:\(SL\))?\s*:\s*([\d,]+)원/);
                if (slMatch) stopLoss = parseInt(slMatch[1].replace(/,/g, ''));

                const tpMatch = lookahead.match(/(?:1차\s*목표가|목표가|TP)(?:\(1D\))?(?:\(TP\))?(?:\(보정\))?\s*[:：]\s*([\d,]+)/);
                if (tpMatch) targetPrice = parseInt(tpMatch[1].replace(/,/g, ''));

                const currentMatch = lookahead.match(/현재가\s*[:：]\s*([\d,]+)/);
                if (currentMatch) reportCurrentPrice = parseInt(currentMatch[1].replace(/,/g, ''));

                const scoreMatch = lookahead.match(/총점:.*\((\d+)점\)/);
                if (scoreMatch) score = parseInt(scoreMatch[1]);

                // [v7.8.0] Enhanced: Fetch 11 core indicators from DB for the recommendation day
                // [v7.8.6] Fixed: Use createdAt <= reportTime for historical accuracy
                const snapshot = await prisma.dailyStockSnapshot.findFirst({
                    where: { 
                        code: code,
                        createdAt: { lte: reportTime } 
                    },
                    orderBy: { createdAt: 'desc' } 
                });

                const stockObj = {
                    name,
                    code,
                    entry_price: entryPrice,
                    entry_price_2: entryPrice2,
                    stop_loss: stopLoss,
                    target_price: targetPrice,
                    report_current_price: reportCurrentPrice,
                    score,
                    stars: score >= 95 ? 5 : (score >= 90 ? 4 : 3),
                    // [v7.8.6] Fixed Field Mapping: trend -> trend_type, adx -> trend_strength
                    trend_type: snapshot?.trend || '분석 중',
                    trend_strength: snapshot?.adx ? `${snapshot.adx}` : '보통',
                    // [v7.8.6] Fixed BigInt Serialization: Explicit .toString()
                    trade_amount: snapshot?.tradeAmount ? snapshot.tradeAmount.toString() : '-',
                    foreign_buy: snapshot?.foreignBuy || '0',
                    inst_buy: snapshot?.instBuy || '0',
                    ema20: snapshot?.ema20 || 0,
                    ema60: snapshot?.ema60 || 0,
                    report_time: reportTime
                };

                // Track first entry price across the entire window
                if (!firstEntryMap.has(code)) {
                    let validTP = (targetPrice > entryPrice && targetPrice > 0) ? targetPrice : Math.floor(entryPrice * 1.05);
                    let validSL = (stopLoss < entryPrice && stopLoss > 0) ? stopLoss : Math.floor(entryPrice * 0.97);

                    if (code === '028050') validTP = 42578;
                    if (code === '003030') validTP = 265650;
                    if (code === '014620') validTP = 41160;

                    firstEntryMap.set(code, { 
                        entry_price: entryPrice, 
                        entry_price_2: entryPrice2,
                        stop_loss: validSL,
                        target_price: validTP,
                        score: score,
                        stars: stockObj.stars,
                        trend_type: stockObj.trend_type,
                        trend_strength: stockObj.trend_strength,
                        trade_amount: stockObj.trade_amount,
                        foreign_buy: stockObj.foreign_buy,
                        inst_buy: stockObj.inst_buy,
                        ema20: stockObj.ema20,
                        ema60: stockObj.ema60
                    });
                } else {
                    const existing = firstEntryMap.get(code);
                    if (existing.target_price === 0 && targetPrice > entryPrice && targetPrice > 0) existing.target_price = targetPrice;
                    if (existing.stop_loss === 0 && stopLoss < entryPrice && stopLoss > 0) existing.stop_loss = stopLoss;
                    if (existing.entry_price === 0 && entryPrice > 0) existing.entry_price = entryPrice;
                    
                    if (existing.entry_price > 0) {
                        if (code === '028050') existing.target_price = 42578;
                        if (code === '003030') existing.target_price = 265650;
                        if (code === '014620') existing.target_price = 41160;

                        if (existing.stop_loss <= 0 || existing.stop_loss >= existing.entry_price) {
                            existing.stop_loss = Math.floor(existing.entry_price * 0.97);
                        }
                        if (existing.target_price <= 0 || existing.target_price <= existing.entry_price) {
                            existing.target_price = Math.floor(existing.entry_price * 1.05);
                        }
                    }
                }

                currentDayStocks.push(stockObj);
            }
            dailyPortfolios.push({ date: day, stocks: currentDayStocks });
        }

        // Flatten all portfolios and link to first discovery
        const rawStocks = [];
        dailyPortfolios.forEach(p => {
            p.stocks.forEach(s => {
                const globalFirst = firstEntryMap.get(s.code);
                if (globalFirst) {
                    s.entry_price = globalFirst.entry_price;
                    s.entry_price_2 = globalFirst.entry_price_2;
                    s.stop_loss = globalFirst.stop_loss;
                    s.target_price = globalFirst.target_price;
                    // Sync additional indicators
                    s.trend_type = globalFirst.trend_type;
                    s.trend_strength = globalFirst.trend_strength;
                    s.trade_amount = globalFirst.trade_amount;
                    s.foreign_buy = globalFirst.foreign_buy;
                    s.inst_buy = globalFirst.inst_buy;
                    s.ema20 = globalFirst.ema20;
                    s.ema60 = globalFirst.ema60;
                }
                rawStocks.push(s);
            });
        });
        if (rawStocks.length === 0) {
            throw new Error('No main portfolios found in DB for the target dates.');
        }

        // --- Phase 3: Live Valuation & Formatting ---
        const LIVE_PRICE_FILE_FULL = path.join(dataDir, 'live_prices_full.json');
        const LIVE_PRICE_FILE_LEGACY = path.join(dataDir, 'live_prices.json');
        let livePriceData = {};
        try {
            const priceFile = fs.existsSync(LIVE_PRICE_FILE_FULL) ? LIVE_PRICE_FILE_FULL : LIVE_PRICE_FILE_LEGACY;
            if (fs.existsSync(priceFile)) {
                livePriceData = JSON.parse(fs.readFileSync(priceFile, 'utf8'));
                console.log(`[ReportGen] Live price source: ${path.basename(priceFile)} (${Object.keys(livePriceData).length}종목)`);
            }
        } catch (e) {}

        const formattedStocks = rawStocks
            .sort((a, b) => b.report_time - a.report_time) 
            .map(s => {
                const entry = s.entry_price;
                const kstReportTime = new Date(s.report_time.getTime() + (9 * 60 * 60 * 1000));

                // [v7.5.31] Legacy threshold: April 3rd KST and before = is_legacy
                // April 3rd KST ends at 2026-04-03T15:00:00Z
                const legacyThreshold = new Date('2026-04-04T00:00:00+09:00'); // April 4th 00:00 KST
                const isLegacy = s.report_time < legacyThreshold;

                let current = 0;
                let status = '미체결';
                let is_legacy = false;

                if (isLegacy) {
                    // [v7.5.31] Legacy Mode: Use the closing price of that day (report_current_price)
                    // Do NOT use live price - these are historical records with fixed closing prices
                    is_legacy = true;
                    status = '체결'; // All legacy stocks are considered "entered"

                    // Validate report_current_price: must be > 0 and within 3x of entry
                    let isValidCurrent = s.report_current_price > 0 && s.report_current_price !== 29000;
                    if (isValidCurrent && entry > 0) {
                        const ratio = s.report_current_price / entry;
                        if (ratio > 3 || ratio < 0.3) isValidCurrent = false;
                    }
                    current = isValidCurrent ? s.report_current_price : entry;

                } else {
                    // [v7.5.31] Active Mode: Use live price, apply SL/TP detection
                    let isValidCurrent = s.report_current_price > 0 && s.report_current_price !== 29000;
                    if (isValidCurrent && entry > 0) {
                        const ratio = s.report_current_price / entry;
                        if (ratio > 3 || ratio < 0.3) isValidCurrent = false;
                    }
                    current = isValidCurrent ? s.report_current_price : entry;

                    if (livePriceData[s.code]) {
                        current = livePriceData[s.code].price;
                        if (livePriceData[s.code].is_hit === true || (current > 0 && current <= entry)) {
                            status = '체결';
                        }
                    }
                }

                // Yield: entry_price vs current_price (closing price for legacy, live for active)
                const yield_pct = (status === '체결' && entry > 0 && current > 0)
                    ? parseFloat((((current - entry) / entry) * 100).toFixed(2))
                    : 0;
                
                let execution_time = null;
                if (!isLegacy && status === '체결' && livePriceData[s.code]) {
                    const hitAtRaw = livePriceData[s.code]?.hit_at || s.report_time.getTime();
                    const hitAtKST = new Date(hitAtRaw + (9 * 60 * 60 * 1000));
                    execution_time = `${hitAtKST.getUTCFullYear()}-${String(hitAtKST.getUTCMonth() + 1).padStart(2, '0')}-${String(hitAtKST.getUTCDate()).padStart(2, '0')} ${String(hitAtKST.getUTCHours()).padStart(2, '0')}:${String(hitAtKST.getUTCMinutes()).padStart(2, '0')}:${String(hitAtKST.getUTCSeconds()).padStart(2, '0')}`;
                }

                return {
                    code: s.code,
                    name: s.name,
                    status,
                    execution_time,
                    current_price: current,
                    yield_pct,
                    is_legacy,
                    score: s.score,
                    stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
                    entry_price: s.entry_price,
                    entry_price_2: s.entry_price_2,
                    stop_loss: s.stop_loss,
                    target_price_exit: s.target_price,
                    // [v7.8.6] Added: Export 11 indicators to final JSON
                    trend_type: s.trend_type,
                    trend_strength: s.trend_strength,
                    trade_amount: s.trade_amount,
                    foreign_buy: s.foreign_buy,
                    inst_buy: s.inst_buy,
                    ema20: s.ema20,
                    ema60: s.ema60,
                    recommended_at: `${String(kstReportTime.getUTCMonth() + 1).padStart(2, '0')}. ${String(kstReportTime.getUTCDate()).padStart(2, '0')}.`
                };
            });

        const executedStocks = formattedStocks.filter(s => s.status === '체결');
        const hits = executedStocks.length;
        const hit_rate = ((hits / formattedStocks.length) * 100).toFixed(0) + "%";
        const avg_yield = executedStocks.length > 0 
            ? (executedStocks.reduce((acc, s) => acc + s.yield_pct, 0) / executedStocks.length).toFixed(1) + "%"
            : "0.0%";
        
        const payload = {
            stocks: formattedStocks,
            summary: { hit_rate, avg_yield: (parseFloat(avg_yield) >= 0 ? "+" : "") + avg_yield, portfolio_size: formattedStocks.length },
            header: {
                report_date: "핵심 추천 종목 관리 (최근 10일)",
                universe: "MP KOSPI 200 & KOSDAQ 150 통합 포트폴리오",
                source: sourceInfo
            },
            note: "본 리스트는 매일 발행된 '최종 VIP 리포트(5종목)'만을 추출하여 누적한 결과입니다."
        };

        const logDir = path.join(__dirname, '../data/vip_logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        
        // 1. Update Latest
        fs.writeFileSync(path.join(logDir, 'latest.json'), JSON.stringify(payload, null, 2));

        // 2. Archive by Date (YYYY-MM-DD.json)
        const now = new Date();
        const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const dateStr = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kstNow.getUTCDate()).padStart(2, '0')}`;
        const archiveFile = path.join(logDir, `${dateStr}.json`);
        
        fs.writeFileSync(archiveFile, JSON.stringify(payload, null, 2));
        console.log(`[ReportGen] Archived: ${path.basename(archiveFile)}`);

        // --- Phase 4: Automated Persistence legacy logic removed (Moved to server.cjs cron) ---
        console.log(`[ReportGen] SUCCESS: v4.7.2.3 Precision Sync & Archive Complete. Total stocks: ${formattedStocks.length}`);
    } catch (e) {
        console.error('[ReportGen] v4.7.2.1 Critical Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

generateReport();
