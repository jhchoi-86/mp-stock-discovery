'use strict';
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugPipeline() {
    console.log('=== [A to Z] 전략 보고서 파이프라인 정밀 진단 시작 ===\n');

    // 1. 데이터 원천 조사 (signals.json)
    const signalsPath = path.join(process.cwd(), 'data/signals.json');
    console.log(`[P1] 데이터 원천: ${signalsPath}`);
    if (!fs.existsSync(signalsPath)) {
        console.error('❌ FAIL: signals.json 파일이 존재하지 않습니다.');
    } else {
        const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
        const total = Object.keys(signals).length;
        const targets = Object.values(signals).filter(s => (s.totalScore || s.score || 0) >= 75);
        console.log(`✅ OK: signals.json 로드 성공 (총 ${total}건)`);
        console.log(`📊 스캔 대상(75점↑): ${targets.length}건`);
        
        if (targets.length > 0) {
            console.log(`🔍 샘플: ${targets[0].name} (${targets[0].code}) - Score: ${targets[0].totalScore || targets[0].score}`);
        } else {
            console.warn('⚠️ WARNING: 75점 이상 종목이 0건입니다. 스캐너가 동작하지 않는 근본 원인일 수 있습니다.');
        }
    }

    // 2. 전략 보고서 파일 조사 (watchlist_strategy.json)
    const reportPath = path.join(process.cwd(), 'data/watchlist_strategy.json');
    console.log(`\n[P2] 전략 보고서 파일: ${reportPath}`);
    if (!fs.existsSync(reportPath)) {
        console.warn('⚠️ WARNING: watchlist_strategy.json 파일이 없습니다. (신규 엔진이 아직 미실행되었거나 생성 실패)');
    } else {
        const stats = fs.statSync(reportPath);
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        console.log(`✅ OK: 리포트 파일 존재 (수정일: ${stats.mtime})`);
        console.log(`📦 종목 수: ${report.stocks?.length || 0}건`);
        console.log(`🔖 버전: ${report.version || 'v9.8.5 (Missing Version)'}`);
    }

    // 3. DB 상태 조사 (ppp_watchlist)
    console.log('\n[P3] DB 상태 조사 (ppp_watchlist)');
    try {
        const activeCount = await prisma.pppWatchlist.count({ where: { is_active: true } });
        console.log(`📊 활성화(is_active: true) 종목 수: ${activeCount}건`);
        
        const latest = await prisma.pppWatchlist.findMany({
            where: { is_active: true },
            orderBy: { score: 'desc' },
            take: 3
        });
        
        if (latest.length > 0) {
            latest.forEach((s, i) => {
                console.log(`  ${i+1}. ${s.name}(${s.code}) Score:${s.score} Gemini:${!!s.gemini_rationale}`);
            });
        } else {
            console.warn('⚠️ WARNING: DB에 활성화된 종목이 없습니다. (Upsert 실패 또는 is_active 필터 문제)');
        }
    } catch (dbErr) {
        console.error('❌ FAIL: DB 조회 중 오류 발생:', dbErr.message);
    }

    // 4. API 노출 시뮬레이션
    console.log('\n[P4] API 노출 시뮬레이션 (StrategyService)');
    try {
        const StrategyService = require('../src/services/StrategyService.cjs');
        const activeRecords = await prisma.pppWatchlist.findMany({
            where: { is_active: true },
            orderBy: { score: 'desc' },
            take: 1
        });
        
        if (activeRecords.length > 0) {
            const enriched = StrategyService.enrichStrategyData(activeRecords[0]);
            console.log(`✅ OK: 데이터 인리치먼트 성공`);
            console.log(`📝 Rationale Sample: ${enriched.rationale.substring(0, 50)}...`);
            console.log(`🤖 AI Generated Status: ${enriched.is_ai_generated}`);
        }
    } catch (svcErr) {
        console.error('❌ FAIL: StrategyService 시뮬레이션 실패:', svcErr.message);
    }

    console.log('\n=== 진단 종료 ===');
    process.exit(0);
}

debugPipeline().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
