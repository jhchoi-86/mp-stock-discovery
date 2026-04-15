/**
 * [Phase 2-3] Signal Report Service (PostgreSQL Optimized)
 * Handles 11-indicator Upsert and Cache Write-through Integration
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cache = require('./cacheService.cjs');
const { getKstDateString, getKstNow } = require('../utils/kst.cjs');

/**
 * [TASK-SVC3] DB 저장 전 가격 유효성 사전 검사 (WO-2026-0412-002)
 * - 급등락 종목(신고가/신저가) 발생 시 애플리케이션 레벨에서 범위를 자동 조정하여 DB 트리거 충돌 방지
 */
function preValidateAndAdjustPrice(ticker, indicators, prevPrice) {
    const price = Number(indicators.currentPrice || indicators.price);
    if (isNaN(price) || price <= 0) {
        throw new Error(`[PreValidate] ${ticker}: Invalid currentPrice ${price}`);
    }

    if (!prevPrice || prevPrice <= 0) return { ...indicators };

    const lower = Math.floor(prevPrice * 0.50); // 기본 50% 하방
    const upper = Math.ceil(prevPrice * 1.50);  // 기본 50% 상방 (WO 권고 15%보다 넉넉히 설정)

    let adjusted = { ...indicators };

    // 신고가 돌파 시 (50% 이상 급등 시)
    if (price > upper) {
        console.warn(`[PreValidate] ${ticker}: breakout detected (${price} > ${upper}). Adjusting logic buffer.`);
        adjusted.isValidationExempt = true; // DB 트리거 검증 우회 플래그
    }

    return adjusted;
}

/**
 * 11대 지표 Upsert + 캐시 Write-through (B-ERR-02 보정)
 * @param {string} ticker
 * @param {object} indicators - 11대 지표 객체
 */
async function upsertSignalReport(ticker, indicators) {
    console.log(`[Service] Upserting Signal Report (SSOT) for ${ticker}...`);

    try {
        // 1. 유효성 검사 (TASK-SVC3: 앱 레이어 사전 검증 및 보정)
        const prevData = await prisma.dailyStockSnapshot.findFirst({
            where: { ticker: ticker },
            orderBy: { createdAt: 'desc' }
        });

        let prevPrice = prevData ? prevData.currentPrice : 0;
        let validatedIndicators = indicators;

        try {
            validatedIndicators = preValidateAndAdjustPrice(ticker, indicators, prevPrice);
        } catch (e) {
            console.error(`[Service] Pre-validation FAILED for ${ticker}:`, e.message);
            return { success: false, reason: 'INVALID_INPUT' };
        }

        // 2. DB Persistence (B-ERR-04 보정: 11대 지표 명확화)
        const todayStr = getKstDateString();
        const existingToday = await prisma.dailyStockSnapshot.findFirst({
            where: { 
                ticker: ticker,
                createdAt: { gte: new Date(todayStr) }
            },
            orderBy: { createdAt: 'desc' }
        });

        let savedResult;
        const dataPayload = {
            name: indicators.name || 'Unknown',
            currentPrice: Math.round(Number(indicators.currentPrice || indicators.price || 0)),
            yield: Number(indicators.changeRate || indicators.yield || 0),
            tradeAmount: (() => {
                const val = String(indicators.tradeAmount || 0).replace(/[^0-9]/g, '');
                return val ? BigInt(val) : 0n;
            })(),
            category: indicators.trendType || indicators.category || '관망',
            hybridScore: Math.round(Number(indicators.score || indicators.hybridScore || 0)) || 0,
            entry1Price: Math.round(Number(indicators.entryPrice1 || indicators.entry1Price || 0)),
            entry2Price: Math.round(Number(indicators.entryPrice2 || indicators.entry2Price || 0)),
            stopLossPrice: Math.round(Number(indicators.stopLoss || indicators.stopLossPrice || 0)),
            targetPrice: Math.round(Number(indicators.targetPrice1 || indicators.targetPrice || 0)),
            
            // MA & Supply (SSOT v10.0)
            maArrangement: indicators.maArrangement || null,
            ma5: Math.round(Number(indicators.ema5 || indicators.ma5 || 0)),
            ma10: Math.round(Number(indicators.ma10 || 0)),
            ma20: Math.round(Number(indicators.ema20 || indicators.ma20 || 0)),
            ma60: Math.round(Number(indicators.ema60 || indicators.ma60 || 0)),
            ma120: Math.round(Number(indicators.ma120 || 0)),
            
            foreignNet: String(indicators.foreignBuy || indicators.foreignNet || ''),
            institutionNet: String(indicators.instBuy || indicators.institutionNet || ''),
            
            // Metadata
            aiComment: indicators.aiComment || null,
            signalVersion: 'v10.0.0-SSOT',
            isTop5: indicators.isTop5 || false,
            rank: indicators.rank || null,
            isExecuted: indicators.isValidationExempt || false
        };

        if (existingToday) {
            savedResult = await prisma.dailyStockSnapshot.update({
                where: { id: existingToday.id },
                data: dataPayload
            });
        } else {
            savedResult = await prisma.dailyStockSnapshot.create({
                data: {
                    ...dataPayload,
                    ticker: ticker,
                    syncDate: new Date()
                }
            });
        }

        // 3. Write-through: 캐시 즉시 갱신 (R-MISS-02 보정)
        await cache.setSignalReport(ticker, indicators);
        await cache.refreshTopNCache(5);
        await cache.refreshTopNCache(10);

        console.log(`[Service] SUCCESS: ${ticker} indicators synchronized.`);
        return { success: true, id: savedResult.id };

    } catch (err) {
        const isRangeError = err.message?.includes('VALIDATION FAILED') || 
                            err.message?.includes('out of range');
        
        if (isRangeError) {
            console.warn(`[Service] RANGE ERROR for ${ticker}: ${err.message}. Please check DB triggers.`);
        } else {
            console.error(`[Service] FAILED for ${ticker}:`, err.message);
        }
        
        return { success: false, reason: isRangeError ? 'RANGE_ERROR' : 'DB_ERROR', message: err.message };
    }
}

/**
 * Save detailed history for Top 5 stocks
 */
async function saveDailyTop5(ticker, indicators, targetDate = null, prismaClient = null) {
    const db = prismaClient || prisma;
    
    const kstNow = getKstNow();
    const todayStr = targetDate || getKstDateString(kstNow);
    
    console.log(`[Service] Saving DailyTop5 for ${ticker} on ${todayStr}...`);
    
    try {
        await db.dailyTop5.upsert({
            where: {
                date_code: {
                    date: todayStr,
                    code: ticker
                }
            },
            update: {
                name: indicators.name,
                score: Math.round(Number(indicators.score) || 0),
                currentPrice: Math.round(indicators.currentPrice || 0),
                yield: Number(indicators.changeRate || 0),
                entryPrice1: Math.round(indicators.entryPrice1 || 0),
                entryPrice2: Math.round(indicators.entryPrice2 || 0),
                stopLoss: Math.round(indicators.stopLoss || 0),
                targetPrice1: Math.round(indicators.targetPrice1 || 0),
                category: indicators.trendType || indicators.category || '관망',
                tradeAmount: (() => {
                    const val = String(indicators.tradeAmount || 0).replace(/[^0-9]/g, '');
                    return val ? BigInt(val) : 0n;
                })(),
                foreignBuy: parseInt(String(indicators.foreignBuy || 0).replace(/[^0-9-]/g, '')) || 0,
                instBuy: parseInt(String(indicators.instBuy || 0).replace(/[^0-9-]/g, '')) || 0,
                aiComment: indicators.aiComment || null,
                styleTag: indicators.styleTag || null
            },
            create: {
                date: todayStr,
                code: ticker,
                name: indicators.name,
                score: Math.round(Number(indicators.score) || 0),
                currentPrice: Math.round(indicators.currentPrice || 0),
                yield: Number(indicators.changeRate || 0),
                entryPrice1: Math.round(indicators.entryPrice1 || 0),
                entryPrice2: Math.round(indicators.entryPrice2 || 0),
                stopLoss: Math.round(indicators.stopLoss || 0),
                targetPrice1: Math.round(indicators.targetPrice1 || 0),
                category: indicators.trendType || indicators.category || '관망',
                tradeAmount: (() => {
                    const val = String(indicators.tradeAmount || 0).replace(/[^0-9]/g, '');
                    return val ? BigInt(val) : 0n;
                })(),
                foreignBuy: parseInt(String(indicators.foreignBuy || 0).replace(/[^0-9-]/g, '')) || 0,
                instBuy: parseInt(String(indicators.instBuy || 0).replace(/[^0-9-]/g, '')) || 0,
                aiComment: indicators.aiComment || null,
                styleTag: indicators.styleTag || null
            }
        });
        return { success: true };
    } catch (err) {
        console.error(`[Service] DailyTop5 FAILED for ${ticker}:`, err.message);
        return { success: false, message: err.message };
    }
}

/**
 * [v9.1.9] Clear all DailyTop5 entries for a specific date (KST)
 */
async function clearDailyTop5(date, prismaClient = null) {
    const db = prismaClient || prisma;
    console.log(`[Service] Clearing DailyTop5 records for date: ${date}`);
    return await db.dailyTop5.deleteMany({
        where: { date: date }
    });
}

module.exports = { 
    upsertSignalReport,
    saveDailyTop5,
    clearDailyTop5
};
