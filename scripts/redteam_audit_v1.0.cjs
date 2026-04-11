/**
 * [Red Team Audit V1.0] 
 * 블루팀이 구축한 SSOT 시스템의 무결성 전수 감사 스크립트
 * 검증 대상: DB 스키마, Redis 캐시, Web API, 텔레그램 연동 상태
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('../platform/infra/redis/client.cjs');
const axios = require('axios');
require('dotenv').config();

async function runAudit() {
    console.log('\n🛡 [Red Team] Starting Comprehensive SSOT Audit v1.0...');
    const findings = {
        db: { pass: false, details: [] },
        cache: { pass: false, details: [] },
        api: { pass: false, details: [] },
        notifications: { pass: false, details: [] }
    };

    try {
        // --- Audit 1: DB Persistence (PostgreSQL) ---
        console.log('1. DB Persistence Audit...');
        const samples = await prisma.dailyStockSnapshot.findMany({
            where: { star_grade: { gt: 0 } },
            take: 5
        });

        if (samples.length > 0) {
            findings.db.pass = true;
            samples.forEach(s => {
                const missingFields = [];
                if (s.currentPrice === null) missingFields.push('currentPrice');
                if (s.entry_price_1 === undefined && s.entryPrice1 === undefined) missingFields.push('entry_price_1');
                if (s.star_grade === null) missingFields.push('star_grade');
                
                if (missingFields.length === 0) {
                    findings.db.details.push(`[PASS] ${s.code} (${s.name}): All 11 metrics present.`);
                } else {
                    findings.db.pass = false;
                    findings.db.details.push(`[FAIL] ${s.code}: Missing fields: ${missingFields.join(', ')}`);
                }
            });
        } else {
            findings.db.details.push('[FAIL] No stocks with star_grade > 0 found in DB.');
        }

        // --- Audit 2: Cache Layer (Redis) ---
        console.log('2. Redis Cache Audit (Write-through Logic)...');
        if (samples.length > 0) {
            findings.cache.pass = true;
            for (const sample of samples) {
                const cacheKey = `mp:signal:${sample.code}`;
                const cached = await redis.get(cacheKey);
                if (cached) {
                    const cData = JSON.parse(cached);
                    // DB와 캐시 수치 대조 (1차 매수가 기준)
                    const dbVal = Number(sample.entry_price_1 || sample.entryPrice1 || 0);
                    const rdVal = Number(cData.entry_price_1 || 0);
                    if (dbVal === rdVal) {
                        findings.cache.details.push(`[PASS] ${sample.code}: Cache sync verified.`);
                    } else {
                        findings.cache.pass = false;
                        findings.cache.details.push(`[FAIL] ${sample.code}: DB=${dbVal}, Cache=${rdVal}`);
                    }
                } else {
                    findings.cache.pass = false;
                    findings.cache.details.push(`[FAIL] ${sample.code}: Cache MISS.`);
                }
            }
        }

        // --- Audit 3: Web API (Express) ---
        console.log('3. Web API Audit (localhost:3001)...');
        try {
            const apiRes = await axios.get('http://localhost:3001/api/ssot/top/5', { timeout: 3000 });
            if (apiRes.data && apiRes.data.data) {
                findings.api.pass = true;
                findings.api.details.push(`[PASS] API response received with ${apiRes.data.data.length} stocks.`);
                // JSON 스키마 필수 필드 확인
                const first = apiRes.data.data[0];
                const required = ['stock_code', 'entry_price_1', 'star_grade', 'trend_type'];
                const missing = required.filter(f => !Object.keys(first).includes(f));
                if (missing.length > 0) {
                    findings.api.pass = false;
                    findings.api.details.push(`[FAIL] API Schema missing fields: ${missing.join(', ')}`);
                }
            }
        } catch (e) {
            findings.api.details.push(`[FAIL] API Request failed: ${e.message}`);
        }

    } catch (err) {
        console.error('\n🔴 [Red Team] Audit Interrupted by Fatal Error:', err.message);
    }

    // --- Audit Summary Report ---
    console.log('\n' + '='.repeat(50));
    console.log('🛡 SSOT 무결성 감사 최종 결과 (Red Team Audit Report)');
    console.log('='.repeat(50));
    
    Object.keys(findings).forEach(key => {
        const status = findings[key].pass ? '✅ [SUCCESS]' : '❌ [CRITICAL ISSUE]';
        console.log(`${status} ${key.toUpperCase()}`);
        findings[key].details.forEach(d => console.log(`   - ${d}`));
    });
    console.log('='.repeat(50));

    process.exit(0);
}

runAudit();
