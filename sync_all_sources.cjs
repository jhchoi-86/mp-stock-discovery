const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const STRATEGY_FILE = path.join(__dirname, 'data', 'landing_strategy.json');
const LATEST_JSON_FILE = path.join(__dirname, 'data', 'vip_logs', 'latest.json');

// GS건설, DL이앤씨, 대우건설, 삼성전기, 롯데케미칼
const TRUE_STOCKS = [
    { code: "006360", name: "GS건설", score: 100, category: "추세 지속형", entryPrice: 25800, targetPrice: 41500, stopLoss: 34400, adx: 31, currentPrice: 37400 },
    { code: "375500", name: "DL이앤씨", score: 96, category: "추세 지속형", entryPrice: 74100, targetPrice: 10800, stopLoss: 89000, adx: 30, currentPrice: 95200 },
    { code: "047040", name: "대우건설", score: 88, category: "추세 지속형", entryPrice: 16000, targetPrice: 25500, stopLoss: 20800, adx: 57, currentPrice: 22550 },
    { code: "009150", name: "삼성전기", score: 80, category: "박스권 횡보", entryPrice: 450000, targetPrice: 565000, stopLoss: 480000, adx: 18, currentPrice: 514000 },
    { code: "011170", name: "롯데케미칼", score: 80, category: "박스권 횡보", entryPrice: 78400, targetPrice: 102000, stopLoss: 85500, adx: 20, currentPrice: 91600 }
];

async function sync() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[Sync] Truth-based Sync for ${today}`);

    // Update landing_strategy.json
    console.log('[Sync] Updating landing_strategy.json...');
    const strategyData = {
        updatedAt: new Date().toISOString(),
        stocks: TRUE_STOCKS
    };
    fs.writeFileSync(STRATEGY_FILE, JSON.stringify(strategyData, null, 2));

    // Update latest.json
    console.log('[Sync] Updating latest.json...');
    const latestData = {
        stocks: TRUE_STOCKS.map(s => ({
            ...s,
            status: "분석완료",
            execution_time: new Date().toISOString(),
            current_price: s.currentPrice,
            entry_price: s.entryPrice,
            target_price_exit: s.targetPrice,
            recommended_at: today.split('-').slice(1).join('. ') + '.'
        })),
        header: {
            report_date: today.split('-').slice(1).join('. ') + '..',
            universe: "MP 통합 포트폴리오 (Live)"
        }
    };
    if (!fs.existsSync(path.dirname(LATEST_JSON_FILE))) fs.mkdirSync(path.dirname(LATEST_JSON_FILE), { recursive: true });
    fs.writeFileSync(LATEST_JSON_FILE, JSON.stringify(latestData, null, 2));

    // Update DB (if reachable)
    try {
        console.log('[Sync] Updating DB...');
        for (const s of TRUE_STOCKS) {
            await prisma.dailyTop5.upsert({
                where: { date_code: { date: today, code: s.code } },
                update: { name: s.name, score: s.score, currentPrice: s.currentPrice, entryPrice1: s.entryPrice, targetPrice1: s.targetPrice, stopLoss: s.stopLoss, category: s.category },
                create: { date: today, code: s.code, name: s.name, score: s.score, currentPrice: s.currentPrice, entryPrice1: s.entryPrice, targetPrice1: s.targetPrice, stopLoss: s.stopLoss, category: s.category }
            });
        }
        console.log('[Sync] DB Updated.');
    } catch (e) {
        console.warn('[Sync] DB skip (unreachable).');
    }

    console.log('[Sync] All local sources synchronized to user reality.');
}

sync().finally(() => prisma.$disconnect().catch(() => {}));
