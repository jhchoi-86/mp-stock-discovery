/**
 * [Phase 2-3] Signal Report Service (PostgreSQL Optimized)
 * Handles 11-indicator Upsert and Cache Write-through Integration
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cache = require('./cacheService.cjs');

/**
 * 11대 지표 Upsert + 캐시 Write-through (B-ERR-02 보정)
 * @param {string} stockCode
 * @param {object} indicators - 11대 지표 객체
 */
async function upsertSignalReport(stockCode, indicators) {
    console.log(`[Service] Upserting Signal Report for ${stockCode}...`);

    try {
        // 1. 유효성 검사 (R-MISS-03 보정: 애플리케이션 레벨 이중 검사)
        const prevData = await prisma.dailyStockSnapshot.findFirst({
            where: { code: stockCode },
            orderBy: { createdAt: 'desc' }
        });

        if (prevData && indicators.currentPrice > 0 && !indicators.isValidationExempt) {
            const prev = prevData.currentPrice;
            if (prev > 0) {
                const lower = Math.floor(prev * 0.30);
                const upper = Math.ceil(prev * 1.30);

                if (indicators.currentPrice < lower || indicators.currentPrice > upper) {
                    const errMsg = `[Validation] ${stockCode}: currentPrice ${indicators.currentPrice} out of range [${lower}~${upper}]`;
                    console.warn(errMsg);
                    // TODO: sendAdminAlert(errMsg)
                    return { success: false, reason: 'VALIDATION_FAILED' };
                }
            }
        }

        // 2. DB Persistence (B-ERR-04 보정: 11대 지표 명확화)
        // [v7.8.23] Use findFirst + update/create instead of invalid upsert (logic SSOT)
        const todayStr = new Date().toISOString().split('T')[0];
        const existingToday = await prisma.dailyStockSnapshot.findFirst({
            where: { 
                code: stockCode,
                createdAt: { gte: new Date(todayStr) }
            },
            orderBy: { createdAt: 'desc' }
        });

        let savedResult;
        const dataPayload = {
            name: indicators.name,
            currentPrice: indicators.currentPrice,
            yield: indicators.changeRate || 0,
            tradeAmount: indicators.tradeAmount ? BigInt(indicators.tradeAmount) : 0n,
            category: indicators.trendType || '관망',
            adx: parseInt(indicators.trendStrength) || 0,
            trend: String(indicators.starGrade || '0'), // Mapping starGrade to trend
            score: indicators.score || 0,
            entryPrice1: indicators.entryPrice1 || 0,
            entryPrice2: indicators.entryPrice2 || 0,
            stopLoss: indicators.stopLoss || 0,
            targetPrice1: indicators.targetPrice1 || 0,
            targetPrice2: indicators.targetPrice2 || 0,
            styleTag: indicators.styleTag || null,
            aiComment: indicators.aiComment || null,
            dailyOpen: indicators.dailyOpen || 0,
            dailyHigh: indicators.dailyHigh || 0,
            dailyLow: indicators.dailyLow || 0,
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
                    code: stockCode,
                    createdAt: new Date()
                }
            });
        }

        // 3. Write-through: 캐시 즉시 갱신 (R-MISS-02 보정)
        await cache.setSignalReport(stockCode, indicators);
        await cache.refreshTopNCache(5);
        await cache.refreshTopNCache(10);

        console.log(`[Service] SUCCESS: ${stockCode} indicators synchronized.`);
        return { success: true, id: savedResult.id };

    } catch (err) {
        console.error(`[Service] FAILED for ${stockCode}:`, err.message);
        return { success: false, reason: 'DB_ERROR' };
    }
}

/**
 * Save detailed history for Top 5 stocks
 */
async function saveDailyTop5(stockCode, indicators) {
    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`[Service] Saving DailyTop5 record for ${stockCode} (${todayStr})...`);

    try {
        const existing = await prisma.dailyTop5.findUnique({
            where: {
                date_code: {
                    date: todayStr,
                    code: stockCode
                }
            }
        });

        // [v8.5.7 Security] Guard against low automated scores overwriting high strategic scores
        // If an existing record has a score >= 50, don't let it be downgraded by automated poller.
        if (existing && existing.score >= 50 && indicators.score < 50) {
            console.log(`[Service] Guard triggered: ${stockCode} high score protected (${existing.score} vs ${indicators.score})`);
            return;
        }

        const data = {
            date: todayStr,
            code: stockCode,
            name: indicators.name,
            score: Math.round(indicators.score || 0),
            currentPrice: indicators.currentPrice || 0,
            yield: indicators.changeRate || 0,
            entryPrice1: indicators.entryPrice1 || 0,
            entryPrice2: indicators.entryPrice2 || 0,
            stopLoss: indicators.stopLoss || 0,
            targetPrice1: indicators.targetPrice1 || 0,
            category: indicators.trendType || '추세 지속형',
            tradeAmount: indicators.tradeAmount ? BigInt(indicators.tradeAmount) : 0n,
            foreignBuy: parseInt(indicators.foreignBuy) || 0,
            instBuy: parseInt(indicators.instBuy) || 0,
            styleTag: indicators.styleTag || null,
            aiComment: indicators.aiComment || null,
            dailyOpen: indicators.dailyOpen || 0,
            dailyHigh: indicators.dailyHigh || 0,
            dailyLow: indicators.dailyLow || 0
        };

        await prisma.dailyTop5.upsert({
            where: {
                date_code: {
                    date: todayStr,
                    code: stockCode
                }
            },
            update: data,
            create: data
        });

        console.log(`[Service] DailyTop5 SUCCESS: ${stockCode}`);
    } catch (err) {
        console.error(`[Service] DailyTop5 FAILED for ${stockCode}:`, err.message);
    }
}

module.exports = { 
    upsertSignalReport,
    saveDailyTop5
};
