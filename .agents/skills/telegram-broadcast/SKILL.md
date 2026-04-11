---
name: telegram-broadcast
description: |
  MP Stock Discovery의 Telegram Bot을 통한 신호 방송 파이프라인을
  설계·구현·디버깅하는 스킬. 구독 티어별 채널 분리, 메시지 포맷 설계,
  방송 실패 재시도, Bot API rate limit 관리에 트리거됨.
  텔레그램, 봇, 방송, Telegram Token 키워드에 트리거됨.
---

# SKILL: telegram-broadcast
# Red-Team Verified: 2026-04-10 | Fixed: 6 defects

## 목표

신호 발생 후 30초 이내에 해당 구독 티어 사용자에게 Telegram 메시지를 발송한다.
방송 실패 시 3회 자동 재시도 후 로그 기록 및 관리자 알림을 발송한다.

---

## 필수 유틸 및 패키지 선언

```javascript
// ✅ 반드시 최상단에 선언 (FIX: sleep, escapeHtml, notifyAdmin 정의)
const { sleep, escapeHtml } = require('./utils/common.cjs');
const { Queue, Worker } = require('bullmq');
const redis = require('./redis.cjs');
```

---

## 채널 구조 (구독 티어별 분리)

```
MP Stock FREE     → 환경변수: TG_CHANNEL_FREE     (WATCH 신호만)
MP Stock Standard → 환경변수: TG_CHANNEL_STANDARD  (WATCH + NORMAL)
MP Stock Premium  → 환경변수: TG_CHANNEL_PREMIUM   (전체 신호 + 우선 알람)
MP Stock 관리자    → 환경변수: TG_CHANNEL_ADMIN     (시스템 오류 알림)
```

> ⚠️ 채널 환경변수 4개 모두 .env에 등록 필수. AGENTS.md 환경변수 목록 참조.

---

## 필수 함수 정의

### notifyAdmin — 관리자 알림 (FIX: 정의 누락 수정)

```javascript
// ✅ notifyAdmin 정의 (server.cjs 또는 telegram.cjs에 export)
const notifyAdmin = async (message) => {
  const adminChannel = process.env.TG_CHANNEL_ADMIN;
  if (!adminChannel) {
    console.error('[notifyAdmin] TG_CHANNEL_ADMIN 환경변수 미설정');
    return;
  }
  // 관리자 알림은 재시도 없이 1회만 시도 (무한 루프 방지)
  await sendTelegramMessage(adminChannel, `⚠️ [시스템 알림]\n${message}`, { retries: 1 });
};
```

---

## 표준 메시지 포맷

```javascript
// ✅ HTML 이스케이프 적용 (FIX: <, > 문자 처리)
const formatSignalMessage = (signal) => {
  const emoji = { STRONG: '🔥', NORMAL: '📊', WATCH: '👀' }[signal.signalType] ?? '📌';
  const bar = '█'.repeat(Math.floor(signal.totalScore / 10)) +
              '░'.repeat(10 - Math.floor(signal.totalScore / 10));

  // HTML 모드 사용 시 종목명/ticker에 특수문자 이스케이프 필수
  const safeName   = escapeHtml(signal.name ?? '');
  const safeTicker = escapeHtml(signal.ticker ?? '');

  return [
    `${emoji} <b>${safeName} (${safeTicker})</b>`,
    `├ 신호: <code>${signal.signalType}</code>`,
    `├ 점수: ${bar} ${signal.totalScore}/100`,
    `├ BBW: ${(signal.bbwValue ?? 0).toFixed(4)}`,
    `├ 시장: ${signal.market === 'COIN' ? '코인' : '주식'}`,
    `├ 타임프레임: ${(signal.timeframes ?? []).map(t => t.tf).join(', ')}`,
    `└ 시각: ${new Date(signal.timestamp).toLocaleString('ko-KR')}`,
    ``,
    `⚠️ 본 정보는 참고용이며 투자 판단의 책임은 본인에게 있습니다.`
  ].join('\n');
};
```

---

## 방송 파이프라인 구현

### sendTelegramMessage — 기본 발송 함수

```javascript
// ✅ 재시도 로직 포함 발송 (sleep은 common.cjs에서 import)
const sendTelegramMessage = async (chatId, text, { retries = 3 } = {}) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
        {
          method  : 'POST',
          headers : { 'Content-Type': 'application/json' },
          body    : JSON.stringify({
            chat_id                  : chatId,
            text                     : text,
            parse_mode               : 'HTML',
            disable_web_page_preview : true
          })
        }
      );

      if (!response.ok) {
        const err = await response.json();
        if (err.error_code === 429) {
          const waitSec = err.parameters?.retry_after ?? attempt;
          console.warn(`[Telegram] Rate limit. Waiting ${waitSec}s`);
          await sleep(waitSec * 1000);
          continue;
        }
        throw new Error(`Telegram API Error ${err.error_code}: ${err.description}`);
      }

      return await response.json();

    } catch (error) {
      if (attempt === retries) {
        await notifyAdmin(`방송 실패 [chatId: ${chatId}]\n${error.message}`);
        throw error;
      }
      await sleep(attempt * 1000); // 1s, 2s, 3s backoff
    }
  }
};
```

### broadcastSignal — 티어별 방송 라우터 (FIX: 시그니처 통일)

```javascript
// ✅ 함수 시그니처 통일 (signal 1개 인자만 받음 — CHANNEL_MAP 내부 계산)
// BullMQ Worker에서도 broadcastSignal(signal)로 호출 (FIX: channels 인자 제거)
const broadcastSignal = async (signal) => {
  const CHANNEL_MAP = {
    WATCH  : [process.env.TG_CHANNEL_FREE, process.env.TG_CHANNEL_STANDARD, process.env.TG_CHANNEL_PREMIUM],
    NORMAL : [process.env.TG_CHANNEL_STANDARD, process.env.TG_CHANNEL_PREMIUM],
    STRONG : [process.env.TG_CHANNEL_PREMIUM]
  };

  const channels = (CHANNEL_MAP[signal.signalType] ?? []).filter(Boolean);
  if (channels.length === 0) {
    console.warn(`[Telegram] 알 수 없는 signalType: ${signal.signalType}`);
    return;
  }

  const message = formatSignalMessage(signal);

  // 채널 순차 발송 (rate limit 준수)
  for (const chatId of channels) {
    await sendTelegramMessage(chatId, message, { retries: 3 });
    await sleep(200);  // 채널 간 200ms 간격 (초당 5건 이하)
  }
};
```

---

## BullMQ 큐 관리

```javascript
// ✅ BullMQ Queue 설정
const broadcastQueue = new Queue('telegram-broadcast', {
  connection: redis,
  defaultJobOptions: {
    attempts : 3,
    backoff  : { type: 'exponential', delay: 1000 }
  }
});

// 신호 발생 시 큐에 추가
const enqueueBroadcast = async (signal) => {
  await broadcastQueue.add('send', { signal }, {
    delay    : 0,
    attempts : 3,
    backoff  : { type: 'exponential', delay: 1000 }
  });
};

// ✅ Worker — broadcastSignal(signal) 단일 인자 호출 (FIX: 시그니처 통일)
const broadcastWorker = new Worker('telegram-broadcast', async (job) => {
  const { signal } = job.data;
  await broadcastSignal(signal);  // channels 인자 없음 (내부 CHANNEL_MAP 사용)
}, {
  connection   : redis,
  concurrency  : 1  // 순차 처리로 rate limit 준수
});

broadcastWorker.on('failed', (job, err) => {
  console.error(`[BullMQ] 방송 Job 실패 id=${job.id}:`, err.message);
});
```

---

## Rate Limit 관리

```
Telegram Bot API 제한:
- 채널당: 초당 1건 (채널 간 200ms sleep으로 준수)
- 전체 봇: 분당 30건 (BullMQ concurrency=1로 순차 처리)
```

---

## 디버깅

```bash
# 봇 토큰 유효성 확인
curl "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe"

# 채널 정보 확인
curl "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getChat?chat_id=${TG_CHANNEL_PREMIUM}"

# 테스트 신호 발송
node -e "
require('dotenv').config();
const { broadcastSignal } = require('./server.cjs');
broadcastSignal({
  ticker: '005930', name: '삼성전자', signalType: 'NORMAL',
  totalScore: 72, bbwValue: 0.0215, market: 'KR_STOCK',
  timeframes: [{tf:'TF60'},{tf:'TF240'}], timestamp: Date.now()
}).then(() => console.log('발송 완료')).catch(console.error);
"
```

---

## 퀄리티 체크리스트

```
[ ] utils/common.cjs에서 sleep, escapeHtml import 확인
[ ] notifyAdmin() 정의 및 export 확인 (무한 루프 방지 retries=1)
[ ] TELEGRAM_TOKEN .env 등록 확인
[ ] TG_CHANNEL_FREE/STANDARD/PREMIUM/ADMIN .env 4개 모두 등록 확인
[ ] broadcastSignal(signal) — 단일 인자 시그니처 확인
[ ] BullMQ Worker에서 broadcastSignal(signal) 단일 인자 호출 확인
[ ] formatSignalMessage — escapeHtml() 적용 확인
[ ] rate limit 초과 시 retry_after 대기 로직 확인
[ ] 채널 간 200ms sleep 적용 확인
[ ] BullMQ concurrency=1 확인
[ ] 메시지 포맷 — 투자 지시 문구 없음 확인
[ ] 테스트 발송 — TG_CHANNEL_ADMIN 수신 확인
```

---

*Skill Level: 4 (Tool & Validation) | Red-Team Verified | MP Stock Discovery v3.0*
