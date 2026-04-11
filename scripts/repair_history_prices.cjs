require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function repair() {
    console.log('[Repair] DATABASE_URL Check:', process.env.DATABASE_URL);
console.log('[Repair] 시작: SyncSaveLog 가격 데이터 전수조사 및 복구');
    
    try {
        const logs = await prisma.syncSaveLog.findMany({
            orderBy: { savedAt: 'desc' }
        });

        console.log(`[Repair] 총 ${logs.length}개의 로그를 확인합니다.`);

        for (const log of logs) {
            let needsUpdate = false;
            const originalSnapshot = Array.isArray(log.snapshot) ? log.snapshot : [];
            
            const repairedSnapshot = await Promise.all(originalSnapshot.map(async (s) => {
                const curPrice = s.currentPrice || s.current_price || 0;
                
                // 가격이 0이거나 필드명이 불완전한 경우 복구 대상
                if (curPrice === 0 || !s.current_price || !s.currentPrice) {
                    needsUpdate = true;
                    
                    // 1. DailyTop5 히스토리에서 해당 날짜(tagName 기준일)의 가격 찾기
                    const datePart = log.tagName.split(' ')[0]; // "2026-04-09"
                    const historyEntry = await prisma.dailyTop5.findFirst({
                        where: {
                            code: s.code,
                            date: datePart
                        }
                    });

                    // 2. DailyStockSnapshot(최근수치)에서 찾기 (historyEntry가 없거나 가격이 0원일 때)
                    const snapshotEntry = (historyEntry && (historyEntry.currentPrice || 0) > 0) ? null : await prisma.dailyStockSnapshot.findFirst({
                        where: { code: s.code },
                        orderBy: { createdAt: 'desc' }
                    });

                    const hPrice = historyEntry?.currentPrice || 0;
                    const sPrice = snapshotEntry?.currentPrice || 0;
                    const realPrice = hPrice > 0 ? hPrice : (sPrice > 0 ? sPrice : curPrice);
                    const e1 = (historyEntry?.entryPrice1 || snapshotEntry?.entryPrice1 || s.entryPrice1 || s.entry_price || s.entry1 || 0);
                    const e2 = (historyEntry?.entryPrice2 || snapshotEntry?.entryPrice2 || s.entryPrice2 || s.entry_price_2 || s.entry2 || 0);
                    const sl = (historyEntry?.stopLoss || snapshotEntry?.stopLoss || s.stopLoss || s.stop_loss || s.sl || 0);
                    const tp = (historyEntry?.targetPrice1 || snapshotEntry?.targetPrice1 || s.targetPrice1 || s.target_price || s.target || 0);
                    const yld = (historyEntry?.yield || snapshotEntry?.yield || s.yield || s.change_rate || 0);

                    console.log(`[Repair] Tag(${log.tagName}) ${s.name}(${s.code}): ${curPrice}원 -> ${realPrice}원 복구 중...`);

                    return {
                        ...s,
                        // 하이브리드 필드 적용
                        currentPrice: realPrice,
                        entryPrice1: e1,
                        entryPrice2: e2,
                        stopLoss: sl,
                        targetPrice1: tp,
                        yield: yld,
                        current_price: realPrice,
                        entry_price: e1,
                        entry_price_1: e1,
                        entry_price_2: e2,
                        stop_loss: sl,
                        target_price: tp,
                        target_price_1: tp,
                        change_rate: yld,
                        yield_pct: yld
                    };
                }
                
                // 이미 데이터가 있다면 하이브리드 필드만 보강
                return {
                    ...s,
                    currentPrice: s.currentPrice || s.current_price || 0,
                    entryPrice1: s.entryPrice1 || s.entry_price || s.entry1 || 0,
                    entryPrice2: s.entryPrice2 || s.entry_price_2 || s.entry2 || 0,
                    stopLoss: s.stopLoss || s.stop_loss || s.sl || 0,
                    targetPrice1: s.targetPrice1 || s.target_price || s.target || 0,
                    yield: s.yield || s.change_rate || 0,
                    current_price: s.current_price || s.currentPrice || 0,
                    entry_price: s.entry_price || s.entryPrice1 || 0,
                    entry_price_1: s.entry_price_1 || s.entryPrice1 || 0,
                    entry_price_2: s.entry_price_2 || s.entryPrice2 || 0,
                    stop_loss: s.stop_loss || s.stopLoss || 0,
                    target_price: s.target_price || s.targetPrice1 || 0,
                    target_price_1: s.target_price_1 || s.targetPrice1 || 0,
                    change_rate: s.change_rate || s.yield || 0,
                    yield_pct: s.yield_pct || s.yield || 0
                };
            }));

            if (needsUpdate) {
                await prisma.syncSaveLog.update({
                    where: { id: log.id },
                    data: { snapshot: repairedSnapshot }
                });
                console.log(`[Repair] SUCCESS: Tag(${log.tagName}) 업데이트 완료`);
            }
        }

        console.log('[Repair] 모든 작업이 완료되었습니다.');
    } catch (error) {
        console.error('[Repair] 에러 발생:', error);
    } finally {
        await prisma.$disconnect();
    }
}

repair();
