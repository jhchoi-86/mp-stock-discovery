const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const SIGNALS_FILE = path.join(process.cwd(), 'data', 'signals.json');

async function restore() {
    console.log('[Restore] Starting 4/5 Snapshot Recovery...');
    if (!fs.existsSync(SIGNALS_FILE)) {
        console.error('signals.json not found');
        return;
    }

    try {
        const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        const targetDate = '2026-04-05'; // 강제 고정
        const filtered = signals.filter(s => s.timeframe === '1D');
        
        console.log(`[Restore] Found ${filtered.length} day-signals. Processing...`);

        for (const s of filtered) {
            // [v7.7.35 SSOT Unified] 11대 지표 매핑
            await prisma.dailyStockSnapshot.upsert({
                where: {
                    date_code: {
                        date: targetDate,
                        code: s.code
                    }
                },
                update: {
                    name: s.name,
                    currentPrice: s.current_price,
                    yield: s.yield || 0,
                    score: s.score || 0,
                    starGrade: s.star_grade || 0,
                    entryPrice1: s.entry_price || 0,
                    entryPrice2: s.entry_price_2 || 0,
                    targetPrice1: s.target_price || 0,
                    stopLoss: s.stop_loss || 0,
                    trendType: s.trend_type || '관망',
                    trendStrength: s.trend_strength || '보통',
                    tradeAmount: s.kis_change_data?.trade_amount ? BigInt(s.kis_change_data.trade_amount) : 0n,
                    foreignBuy: s.kis_change_data?.foreign_buy || '-',
                    instBuy: s.kis_change_data?.inst_buy || '-',
                    category: s.category || '기타'
                },
                create: {
                    date: targetDate,
                    code: s.code,
                    name: s.name,
                    currentPrice: s.current_price,
                    yield: s.yield || 0,
                    score: s.score || 0,
                    starGrade: s.star_grade || 0,
                    entryPrice1: s.entry_price || 0,
                    entryPrice2: s.entry_price_2 || 0,
                    targetPrice1: s.target_price || 0,
                    stopLoss: s.stop_loss || 0,
                    trendType: s.trend_type || '관망',
                    trendStrength: s.trend_strength || '보통',
                    tradeAmount: s.kis_change_data?.trade_amount ? BigInt(s.kis_change_data.trade_amount) : 0n,
                    foreignBuy: s.kis_change_data?.foreign_buy || '-',
                    instBuy: s.kis_change_data?.inst_buy || '-',
                    category: s.category || '기타',
                    createdAt: new Date('2026-04-05T16:00:00Z') // 분석 종료 시점 추정
                }
            });
        }
        console.log(`[Restore] Successfully restored/updated snapshots for ${filtered.length} stocks.`);
    } catch (err) {
        console.error('[Restore] Failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

restore();
