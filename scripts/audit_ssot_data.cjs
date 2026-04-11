const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

dotenv.config();

const prisma = new PrismaClient();

async function runAudit() {
    console.log('[Audit] 데이터 전수 조사 시작...');
    
    try {
        // 1. 4월 5일 및 그 이전 데이터 추출
        const targetDate = new Date('2026-04-06');
        const snapshots = await prisma.dailyStockSnapshot.findMany({
            where: {
                createdAt: {
                    lt: targetDate
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        console.log(`[Audit] 총 ${snapshots.length}건의 스냅샷 발견.`);

        // 2. 날짜별 그룹화 및 지표 무결성 체크
        const auditResults = {};
        
        snapshots.forEach(s => {
            const dateKey = s.createdAt.toISOString().split('T')[0];
            if (!auditResults[dateKey]) {
                auditResults[dateKey] = {
                    total: 0,
                    missingMetrics: 0,
                    samples: []
                };
            }
            
            auditResults[dateKey].total++;
            
            // 핵심 11대 지표 중 주요 5종 누락 체크 (매수가1,2, 손절가, 목표가1, 별점)
            const isCorrupted = !s.entryPrice1 || !s.entryPrice2 || !s.stopLoss || !s.targetPrice1 || s.score === null;
            if (isCorrupted) {
                auditResults[dateKey].missingMetrics++;
            }

            // 샘플링 (날짜별 상위 3종목)
            if (auditResults[dateKey].samples.length < 3) {
                auditResults[dateKey].samples.push({
                    code: s.code,
                    name: s.name,
                    price: s.currentPrice,
                    entry1: s.entryPrice1,
                    sl: s.stopLoss,
                    tp: s.targetPrice1,
                    score: s.score
                });
            }
        });

        console.log('[Audit] 결과 분석 완료:');
        console.log(JSON.stringify(auditResults, null, 2));

    } catch (error) {
        console.error('[Audit] 조사 중 오류 발생:', error);
    } finally {
        await prisma.$disconnect();
    }
}

runAudit();
