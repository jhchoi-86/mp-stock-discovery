'use strict';

const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { runPppScan, checkSignalChanges, updateCurrentPrices } = require('./ppp_filter.cjs');
const { sendMessage: sendTelegram } = require('./src/services/telegramService.cjs');

const prisma = new PrismaClient();
const telegramId = process.env.TELEGRAM_CHAT_ID;

/**
 * [TASK-03] PPP 워치리스트 자동화 스케줄러
 */

// 1. 매일 장 마감 후 16:30 스캔 시작 (평일 기준, KST)
cron.schedule('30 16 * * 1-5', async () => {
    console.log('[PPP Scheduler] 일일 스캔 시작:', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
    try {
        const result = await runPppScan();
        console.log(`[PPP Scheduler] 스캔 완료 — 신규: ${result.added}, 스킵: ${result.skipped}, 대상: ${result.total}`);

        if (telegramId) {
            const ids = telegramId.split(',').map(id => id.trim());
            for (const id of ids) {
                await sendTelegram(id, `✅ [PPP] 일일 스캔 완료\n- 추가: ${result.added}건\n- 스킵: ${result.skipped}건`);
            }
        }

        // 스캔 직후 신호 감지 알림 실행 (순서 보장)
        console.log('[PPP Scheduler] 신호 변화 감지 시작...');
        await checkSignalChanges();
        console.log('[PPP Scheduler] 신호 변화 감지 완료');
    } catch (e) {
        console.error('[PPP Scheduler] 스캔/알림 오류:', e.message);
    }
}, { timezone: 'Asia/Seoul' });

// 2. 매일 00:05 만료 종목 비활성화 (매일, KST)
cron.schedule('5 0 * * *', async () => {
    console.log('[PPP Scheduler] 만료 체크 시작:', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
    try {
        const now = new Date();
        const expired = await prisma.pppWatchlist.updateMany({
            where: {
                expires_at: { lte: now },
                is_active: true
            },
            data: {
                is_active: false
            }
        });
        console.log(`[PPP Scheduler] 만료 처리 완료: ${expired.count}건`);
    } catch (e) {
        console.error('[PPP Scheduler] 만료 처리 오류:', e.message);
    }
}, { timezone: 'Asia/Seoul' });

// 3. 평일 장중 1분 단위 현재가 동기화 (09:00 ~ 15:35, 월-금 KST)
cron.schedule('*/1 9-15 * * 1-5', async () => {
    const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const hour = kstNow.getHours();
    const min = kstNow.getMinutes();
    
    // 15:35 이후 중단
    if (hour === 15 && min > 35) return;

    console.log('[PPP Scheduler] 실시간 가격 동기화 실행...');
    try {
        await updateCurrentPrices();
    } catch (e) {
        console.error('[PPP Scheduler] 가격 동기화 오류:', e.message);
    }
}, { timezone: 'Asia/Seoul' });

console.log('[PPP Scheduler] 시스템 등록 완료 (16:30 스캔 / 00:05 만료체크 / 1분 간격 가격갱신)');
