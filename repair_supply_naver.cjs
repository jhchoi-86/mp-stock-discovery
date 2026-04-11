require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * [v8.6.3] Naver-based Supply Data Repair Script
 * Fetches real-time Foreigner/Institutional net purchase data from Naver
 * and synchronizes it to DB (DailyTop5) and local JSON (latest.json).
 */

async function fetchNaverSupply(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/integration`;
    return new Promise((resolve, reject) => {
        https.get(url, (resp) => {
            let data = '';
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json && json.dealTrendInfos && json.dealTrendInfos.length > 0) {
                        const todayTrend = json.dealTrendInfos[0];
                        const safeParse = (str) => parseInt(String(str || '0').replace(/,/g, '')) || 0;
                        resolve({
                            foreign: safeParse(todayTrend.foreignerPureBuyQuant),
                            inst: safeParse(todayTrend.organPureBuyQuant),
                            tradeAmount: safeParse(todayTrend.accumulatedTradingVolume)
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on("error", (err) => {
            reject(err);
        });
    });
}

async function main() {
    const todayKst = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const todayStr = todayKst.toISOString().split('T')[0];
    const displayDate = `${String(todayKst.getUTCMonth() + 1).padStart(2, '0')}. ${String(todayKst.getUTCDate()).padStart(2, '0')}.`;
    
    console.log(`[Repair-Naver] Starting supply data repair for ${todayStr} (${displayDate})...`);

    // 1. Fetch Top 5 from DB
    const top5 = await prisma.dailyTop5.findMany({
        where: { date: todayStr },
        orderBy: { score: 'desc' }
    });

    if (top5.length === 0) {
        console.log(`[Repair-Naver] No Top 5 records found for ${todayStr}. Check DailyTop5 table.`);
        return;
    }

    console.log(`[Repair-Naver] Found ${top5.length} stocks. Fetching from Naver...`);

    const updatedStocks = [];

    for (const stock of top5) {
        try {
            console.log(`[Repair-Naver] Processing ${stock.name} (${stock.code})...`);
            const supply = await fetchNaverSupply(stock.code);
            
            if (supply) {
                // Keep existing score, target, entry, etc.
                // Just update supply and currentPrice if needed (but primarily supply as requested)
                await prisma.dailyTop5.update({
                    where: { id: stock.id },
                    data: {
                        foreignBuy: supply.foreign,
                        instBuy: supply.inst
                    }
                });
                console.log(`[Repair-Naver] SUCCESS: F:${supply.foreign}, I:${supply.inst}`);
                
                updatedStocks.push({
                    ...stock,
                    foreignBuy: supply.foreign,
                    instBuy: supply.inst
                });
            } else {
                console.warn(`[Repair-Naver] No data found for ${stock.name}`);
                updatedStocks.push(stock);
            }
            
            // Minimal delay to be polite to Naver
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            console.error(`[Repair-Naver] Error processing ${stock.code}:`, e.message);
            updatedStocks.push(stock);
        }
    }

    // 2. Synchronize to latest.json
    const VIP_LOGS_DIR = path.join(__dirname, 'data/vip_logs');
    if (!fs.existsSync(VIP_LOGS_DIR)) fs.mkdirSync(VIP_LOGS_DIR, { recursive: true });

    const formatForJson = (stocks) => ({
        stocks: stocks.map(s => ({
            code: s.code,
            name: s.name,
            status: "분석완료",
            current_price: s.currentPrice,
            yield_pct: s.yield,
            score: s.score,
            stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
            entry_price: s.entryPrice1,
            entry_price_2: s.entryPrice2,
            stop_loss: s.stopLoss,
            target_price_exit: s.targetPrice1,
            trade_amount: s.tradeAmount.toString(),
            foreign_buy: (s.foreignBuy > 0 ? '+' : '') + s.foreignBuy.toLocaleString() + '주',
            inst_buy: (s.instBuy > 0 ? '+' : '') + s.instBuy.toLocaleString() + '주',
            recommended_at: displayDate
        })),
        summary: {
            hit_rate: "100%",
            avg_yield: "+0.0%",
            portfolio_size: stocks.length
        },
        header: { report_date: displayDate, universe: "MP 통합 포트폴리오 (SSOT)" }
    });

    const reportJson = formatForJson(updatedStocks);
    const reportPath = path.join(VIP_LOGS_DIR, `${todayStr}.json`);
    const latestPath = path.join(VIP_LOGS_DIR, 'latest.json');

    fs.writeFileSync(reportPath, JSON.stringify(reportJson, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(reportJson, null, 2));
    console.log(`[Repair-Naver] Successfully updated ${latestPath} and ${reportPath}`);

    // 3. Clear Redis Cache (SSOT)
    try {
        const redis = require('./platform/infra/redis/client.cjs');
        await redis.del('mp:top:5');
        console.log('[Repair-Naver] Redis Cache Cleared.');
    } catch (e) {
        console.log('[Repair-Naver] Redis Clear skipped (not available).');
    }

    console.log('[Repair-Naver] REPAIR COMPLETE.');
}

main()
    .catch(e => { console.error('[Repair-Naver] CRITICAL ERROR:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); process.exit(0); });
