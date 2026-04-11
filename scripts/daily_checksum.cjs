/**
 * [Phase 5] Daily Checksum Verification Script
 * Cross-validates data between PostgreSQL DB, Redis Cache, and Web API.
 * Reporting to Telegram Admin channel.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('../platform/infra/redis/client.cjs');
const axios = require('axios');
const { sendTelegramMessage } = require('../telegramBot.cjs');

async function runChecksum() {
    console.log('[Checksum] Daily verification starting...');
    const issues = [];
    const API_URL = process.env.API_URL || 'http://localhost:3001';

    try {
        // 1. Fetch Top 10 from DB
        const dbRows = await prisma.dailyStockSnapshot.findMany({
            where: { starGrade: { notIn: ['0', 'nullable'] } },
            orderBy: [
                { starGrade: 'desc' },
                { createdAt: 'desc' }
            ],
            take: 10
        });

        if (dbRows.length === 0) {
            issues.push('[DB_EMPTY] No valid snapshots found in DailyStockSnapshot');
        }

        for (const row of dbRows) {
            // 2. Compare with Redis Cache
            const cacheKey = `mp:signal:${row.code}`;
            const cached = await redis.get(cacheKey);

            if (!cached) {
                issues.push(`[CACHE_MISS] ${row.code}: No cache found for ${cacheKey}`);
                continue;
            }

            const cachedData = JSON.parse(cached);
            
            // Core field check (Price, Yield, Grade)
            if (Math.abs(cachedData.currentPrice - (row.currentPrice || 0)) > 1) {
                issues.push(`[MISMATCH] ${row.code}.price: DB=${row.currentPrice}, Cache=${cachedData.currentPrice}`);
            }
            if (cachedData.starGrade !== row.starGrade) {
                issues.push(`[MISMATCH] ${row.code}.starGrade: DB=${row.starGrade}, Cache=${cachedData.starGrade}`);
            }
        }

        // 3. Compare with Web API Response (Top 5)
        try {
            const apiRes = await axios.get(`${API_URL}/api/ssot/top/5`);
            const apiData = apiRes.data.data;

            for (const apiRow of apiData) {
                const dbMatch = dbRows.find(r => r.code === apiRow.stock_code);
                if (!dbMatch) {
                    issues.push(`[API_EXTRA] ${apiRow.stock_code}: Exists in API but not in DB Top 10`);
                    continue;
                }
                if (String(apiRow.star_grade) !== String(dbMatch.starGrade)) {
                    issues.push(`[API_MISMATCH] ${apiRow.stock_code}.star_grade: API=${apiRow.star_grade}, DB=${dbMatch.starGrade}`);
                }
            }
        } catch (e) {
            issues.push(`[API_ERROR] Failed to fetch from Web API: ${e.message}`);
        }

        // 4. Report Results to Telegram
        if (issues.length === 0) {
            const successMsg = `✅ [SSOT Checksum] Success\n- 대상: 상위 10개 종목\n- 결과: DB ↔ Cache ↔ API 100% 일치\n- 시점: ${new Date().toLocaleString()}`;
            await sendTelegramMessage(successMsg);
            console.log('[Checksum] PASS: All channels synchronized.');
        } else {
            const errorMsg = `❌ [SSOT Checksum] FAILED (${issues.length} errors)\n\n${issues.slice(0, 10).join('\n')}${issues.length > 10 ? '\n...외 다수' : ''}\n\n시점: ${new Date().toLocaleString()}`;
            await sendTelegramMessage(errorMsg);
            console.error('[Checksum] FAIL:', issues);
        }

    } catch (err) {
        console.error('[Checksum] CRITICAL ERROR:', err.message);
        await sendTelegramMessage(`🚨 [SSOT Checksum] Critical Failure: ${err.message}`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    runChecksum();
}

module.exports = { runChecksum };
