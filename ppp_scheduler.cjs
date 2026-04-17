'use strict';

const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { runPppScan, checkSignalChanges } = require('./ppp_filter.cjs');
const { sendMessage: sendTelegram } = require('./src/services/telegramService.cjs');

const prisma = new PrismaClient();
const telegramId = process.env.TELEGRAM_CHAT_ID;

/**
 * [TASK-03] PPP 워치리스트 자동화 스케줄러
 */

// 1. 매일 장 마감 후 16:30 스캔 시작 (평일 기준, KST)
// [C2 반영] 스캔 완료 후 즉시 신호 변화 감지(checkSignalChanges)를 콜백으로 호출
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

console.log('[PPP Scheduler] 시스템 등록 완료 (16:30 스캔 / 00:05 만료 체크)');
