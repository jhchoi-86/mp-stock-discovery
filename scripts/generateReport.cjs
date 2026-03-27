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

            // If we already have a main report for this day, skip (since we iterate desc)
            if (dailyMainReports.has(dateKey)) continue;

            const lines = report.content.split('\n');
            let stockCount = 0;
            for (const line of lines) {
                if (line.includes('🔹')) stockCount++;
            }

            // --- FILTER: Only accept reports with exactly 5 stocks (The 'Main' portfolios) ---
            if (stockCount === 5) {
                console.log(`[ReportGen] Selected Daily Main for ${dateKey}: ${report.id.substring(0,8)}`);
                dailyMainReports.set(dateKey, report);
            }
        }

        const stockMap = new Map(); // Key: code, Value: latest stock
        const sortedDays = Array.from(dailyMainReports.keys()).sort((a,b) => b.localeCompare(a));
        
        // Only process the last 3 days (3/27, 3/26, 3/25) as requested
        const targetDays = sortedDays.slice(0, 3);
        console.log(`[ReportGen] Aggregating ${targetDays.length} target days: ${targetDays.join(', ')}`);

        for (const day of targetDays) {
            const report = dailyMainReports.get(day);
            const reportTime = new Date(report.sentAt);
            const lines = report.content.split('\n');
            let currentStock = null;

            for (const line of lines) {
                const titleMatch = line.match(/🔹\s+(.+)\s+\((.+)\)/);
                if (titleMatch) {
                    if (currentStock && currentStock.entry_price > 0 && !stockMap.has(currentStock.code)) {
                        stockMap.set(currentStock.code, currentStock);
                    }
                    currentStock = {
                        name: titleMatch[1].trim(),
                        code: titleMatch[2].trim(),
                        entry_price: 0,
                        score: 95,
                        report_time: reportTime
                    };
                }

                const priceMatch = line.match(/1차\s+매수진입가\(1H\):\s+([\d,]+)원/);
                if (priceMatch && currentStock) {
                    currentStock.entry_price = parseInt(priceMatch[1].replace(/,/g, ''));
                }

                const scoreMatch = line.match(/총점:.*\((\d+)점\)/);
                if (scoreMatch && currentStock) {
                    currentStock.score = parseInt(scoreMatch[1]);
                }
            }
            if (currentStock && currentStock.entry_price > 0 && !stockMap.has(currentStock.code)) {
                stockMap.set(currentStock.code, currentStock);
            }
        }

        const rawStocks = Array.from(stockMap.values());
        if (rawStocks.length === 0) {
            throw new Error('No main portfolios found in DB for the target dates.');
        }

        // --- Phase 3: Live Valuation & Formatting ---
        const LIVE_PRICE_FILE = path.join(dataDir, 'live_prices.json');
        let livePriceData = {};
        try {
            if (fs.existsSync(LIVE_PRICE_FILE)) {
                livePriceData = JSON.parse(fs.readFileSync(LIVE_PRICE_FILE, 'utf8'));
            }
        } catch (e) {}

        const formattedStocks = rawStocks
            .sort((a, b) => b.report_time - a.report_time) 
            .map(s => {
                const entry = s.entry_price;
                let current = entry; 
                let status = '미체결';

                if (livePriceData[s.code]) {
                    current = livePriceData[s.code].price;
                    if (livePriceData[s.code].is_hit === true || (current > 0 && current <= entry)) {
                        status = '체결';
                    }
                }

                const yield_pct = entry > 0 ? parseFloat((((current - entry) / entry) * 100).toFixed(2)) : 0;
                const kstReportTime = new Date(s.report_time.getTime() + (9 * 60 * 60 * 1000));
                
                let execution_time = null;
                if (status === '체결' && livePriceData[s.code]?.hit_at) {
                    const hitAtKST = new Date(livePriceData[s.code].hit_at + (9 * 60 * 60 * 1000));
                    execution_time = `${hitAtKST.getUTCFullYear()}-${String(hitAtKST.getUTCMonth() + 1).padStart(2, '0')}-${String(hitAtKST.getUTCDate()).padStart(2, '0')} ${String(hitAtKST.getUTCHours()).padStart(2, '0')}:${String(hitAtKST.getUTCMinutes()).padStart(2, '0')}:${String(hitAtKST.getUTCSeconds()).padStart(2, '0')}`;
                }

                return {
                    code: s.code,
                    name: s.name,
                    status,
                    execution_time,
                    current_price: current,
                    yield_pct,
                    score: s.score,
                    stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
                    target_price: entry,
                    recommended_at: `${String(kstReportTime.getUTCMonth() + 1).padStart(2, '0')}. ${String(kstReportTime.getUTCDate()).padStart(2, '0')}.`
                };
            });

        const hits = formattedStocks.filter(s => s.status === '체결').length;
        const hit_rate = ((hits / formattedStocks.length) * 100).toFixed(0) + "%";
        const avg_yield = (formattedStocks.reduce((acc, s) => acc + s.yield_pct, 0) / formattedStocks.length).toFixed(1) + "%";
        
        const payload = {
            stocks: formattedStocks,
            summary: { hit_rate, avg_yield: (parseFloat(avg_yield) >= 0 ? "+" : "") + avg_yield, portfolio_size: formattedStocks.length },
            header: {
                report_date: "핵심 추천 종목 관리 (최근 3일)",
                universe: "MP KOSPI 200 & KOSDAQ 150 통합 포트폴리오",
                source: sourceInfo
            },
            note: "본 리스트는 매일 발행된 '최종 VIP 리포트(5종목)'만을 추출하여 누적한 결과입니다."
        };

        const logDir = path.join(__dirname, '../data/vip_logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.writeFileSync(path.join(logDir, 'latest.json'), JSON.stringify(payload, null, 2));

        // --- Phase 4: Automated Persistence to DailyStockSnapshot (v4.7.2.2) ---
        console.log(`[ReportGen] Persisting ${formattedStocks.length} performance snapshots to DB...`);
        try {
            const snapshotData = formattedStocks.map(s => ({
                code: s.code,
                name: s.name,
                category: s.status === '체결' ? '추천종목' : '스나이퍼 포착',
                score: s.score || 95,
                currentPrice: s.current_price,
                entryPrice1: s.target_price,
                yield: s.yield_pct,
                isExecuted: s.status === '체결',
                executedAt: s.execution_time
            }));
            
            // Note: skipDuplicates ensures we don't spam identical entries on hourly intervals
            // For production, we'll rely on the default 'createdAt' to separate days.
            await prisma.dailyStockSnapshot.createMany({
                data: snapshotData,
                skipDuplicates: true
            });
            console.log(`[ReportGen] SUCCESS: DB persistence complete.`);
        } catch (dbErr) {
            console.error('[ReportGen] DB Persistence Error:', dbErr);
        }

        console.log(`[ReportGen] SUCCESS: v4.7.2.2 Precision Sync Complete. Total stocks: ${formattedStocks.length}`);
    } catch (e) {
        console.error('[ReportGen] v4.7.2.1 Critical Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

generateReport();
