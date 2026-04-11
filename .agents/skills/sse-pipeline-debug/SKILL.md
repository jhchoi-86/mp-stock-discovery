---
name: sse-pipeline-debug
description: |
  MP Stock Discovery의 SSE(Server-Sent Events) 실시간 신호 스트림 파이프라인의
  연결 단절, 재연결 실패, 스트림 데이터 누락, 캐시-웹훅 경합(race condition)
  문제를 진단하고 복구하는 스킬.
  SSE 오류, 스트림 단절, 연결 안 됨, useStockManager 관련 키워드에 트리거됨.
---

# SKILL: sse-pipeline-debug
# Red-Team Verified: 2026-04-10 | Fixed: 6 defects

## 목표

SSE 파이프라인의 99.9% 업타임을 유지한다.
연결 단절 → 자동 재연결 → 데이터 동기화의 복구 사이클을 30초 이내 완료한다.

---

## ⚠️ SSE 핵심 제약 사항 (설계 시 최우선 숙지)

```
EventSource API 제약: 브라우저 표준 EventSource는 커스텀 HTTP 헤더 미지원.
Authorization: Bearer xxx 헤더 방식 절대 사용 금지.
인증 방법: JWT를 URL 쿼리 파라미터(?token=JWT) 또는 HttpOnly Cookie로 전달.
```

---

## SSE 파이프라인 전체 구조

```
[server.cjs]
  └── /api/sse/signals?token=JWT  (SSE 엔드포인트 — URL 토큰 인증)
        ↓ EventSource (헤더 없음)
[SSEContext.jsx]
  └── useEffect → new EventSource(`${url}?token=${jwtToken}`)
        ↓ onmessage
[useStockManager.js]
  └── handleSignalUpdate() → setState()
        ↓
[App.jsx → Dashboard 컴포넌트 렌더링]
```

---

## 표준 SSE 구현 패턴

### 서버 (server.cjs)

```javascript
const { Mutex } = require('async-mutex');
const { sleep } = require('./utils/common.cjs');

// ✅ SSE 엔드포인트 — URL 파라미터 토큰 인증
app.get('/api/sse/signals', (req, res) => {
  // JWT 인증 — URL 파라미터 방식 (헤더 불가)
  const token = req.query.token;
  if (!token) return res.status(401).end();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (e) {
    return res.status(401).end();
  }

  const userTier = decoded.tier;  // JWT payload에서 추출 (req.query 신뢰 금지)

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 초기 연결 확인
  res.write('event: connected\ndata: {"status":"ok"}\n\n');

  // Heartbeat (30초 간격)
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  // ✅ EventEmitter 구독 — off() 방식 (FIX: on()은 emitter 반환, unsubscribe 아님)
  const signalHandler = (signal) => {
    if (checkSignalAccess(userTier, signal.signalType)) {
      res.write(`event: signal\ndata: ${JSON.stringify(signal)}\n\n`);
    }
  };

  signalEmitter.on('signal', signalHandler);

  // 연결 종료 처리
  req.on('close', () => {
    clearInterval(heartbeat);
    signalEmitter.off('signal', signalHandler);  // FIX: on() 아닌 off()로 해제
    console.log(`[SSE] Disconnected: user=${decoded.userId} tier=${userTier}`);
  });
});
```

### 클라이언트 (SSEContext.jsx)

```javascript
import { useEffect, useRef, useState, useCallback } from 'react';

// ✅ URL 토큰 파라미터 방식 (헤더 불가)
const useSSEConnection = (baseUrl, jwtToken) => {
  const [connected, setConnected] = useState(false);
  const [fatalError, setFatalError] = useState(false);  // FIX: 최대 재시도 후 UI 안내
  const retryCount = useRef(0);
  const maxRetries = 3;

  useEffect(() => {
    if (!jwtToken) return;
    if (fatalError) return;  // 최대 재시도 초과 시 새 연결 시도 중단

    let eventSource;

    const connect = () => {
      // URL에 토큰 포함 (헤더 방식 불가)
      const url = `${baseUrl}?token=${encodeURIComponent(jwtToken)}`;
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setConnected(true);
        retryCount.current = 0;
      };

      eventSource.onerror = () => {
        setConnected(false);
        eventSource.close();

        if (retryCount.current < maxRetries) {
          const delay = Math.pow(2, retryCount.current) * 1000; // 1s, 2s, 4s
          retryCount.current++;
          console.warn(`[SSE] Retry ${retryCount.current}/${maxRetries} in ${delay}ms`);
          setTimeout(connect, delay);
        } else {
          // FIX: 최대 재시도 초과 → 페이지 리로드 안내
          setFatalError(true);
          console.error('[SSE] Max retries exceeded. User action required.');
        }
      };

      eventSource.addEventListener('signal', (e) => {
        try {
          const signal = JSON.parse(e.data);
          if (onSignal) onSignal(signal);
        } catch (err) {
          console.error('[SSE] JSON parse error:', err);
        }
      });
    };

    connect();
    return () => {
      eventSource?.close();
    };
  }, [baseUrl, jwtToken, fatalError]);

  return { connected, fatalError };
};

// ✅ fatalError 시 UI 안내 컴포넌트
// if (fatalError) return <ReconnectBanner onRetry={() => window.location.reload()} />;
```

---

## 디버깅 사다리 (Debugging Ladder)

### Level 1 — 연결 자체가 안 될 때

```bash
# 서버 실행 확인
lsof -i :3001

# SSE 엔드포인트 직접 테스트 (URL 토큰 방식)
TEST_TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign({userId:'test', tier:'premium'}, process.env.JWT_SECRET, {expiresIn:'1h'}));
" 2>/dev/null)

curl -N "http://localhost:3001/api/sse/signals?token=${TEST_TOKEN}"
# 예상 출력:
# event: connected
# data: {"status":"ok"}
# :heartbeat
```

### Level 2 — 연결되나 데이터가 안 올 때

```bash
node -e "
const { signalEmitter } = require('./server.cjs');
signalEmitter.on('signal', (s) => console.log('[TEST SIGNAL]', s));
setTimeout(() => signalEmitter.emit('signal', {
  ticker: '005930', name: '삼성전자', signalType: 'NORMAL', totalScore: 65, market: 'KR_STOCK'
}), 1000);
"
```

### Level 3 — 캐시-웹훅 Race Condition

```javascript
// ✅ Mutex로 Race Condition 해결 (async-mutex 사용)
const { Mutex } = require('async-mutex');
const signalMutex = new Mutex();

async function updateSignalCache(newSignal) {
  const release = await signalMutex.acquire();
  try {
    const cached = await redis.get('signals:latest');
    const signals = cached ? JSON.parse(cached) : [];
    signals.push(newSignal);
    // 최근 100건만 유지
    const trimmed = signals.slice(-100);
    await redis.setex('signals:latest', 300, JSON.stringify(trimmed));
    signalEmitter.emit('signal', newSignal);  // 캐시 업데이트 후 emit
  } finally {
    release();
  }
}
```

### Level 4 — useStockManager 상태 불일치

```javascript
const DEBUG_SSE = process.env.DEBUG_SSE === 'true';

const handleSignalUpdate = useCallback((signal) => {
  if (DEBUG_SSE) console.log('[useStockManager] Signal received:', signal);
  setSignals(prev => {
    const updated = [...prev, signal].slice(-100);
    return updated;
  });
}, []);
```

```bash
DEBUG_SSE=true npm run dev
```

### Level 5 — Nginx 프록시 설정 (FIX: 지시어 오류 수정)

```nginx
# nginx.conf — SSE 전용 설정
location /api/sse/ {
    proxy_pass         http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header   Connection '';        # keep-alive (빈 값)
    proxy_set_header   Host $host;
    proxy_buffering    off;                  # SSE 버퍼링 비활성화 (필수)
    proxy_cache        off;
    proxy_read_timeout 86400s;              # 24시간 타임아웃
    # chunked_transfer_encoding — nginx 기본 활성화 상태, 별도 지시어 불필요
}
```

---

## 퀄리티 체크리스트

```
[ ] SSE 인증 — URL ?token= 파라미터 방식 사용 확인 (헤더 방식 금지)
[ ] JWT 검증 — algorithms: ['HS256'] 명시 확인
[ ] tier 판단 — decoded.tier (JWT payload) 사용 확인
[ ] signalEmitter.off() — 연결 종료 시 핸들러 해제 확인 (on() 아님)
[ ] async-mutex Mutex import 확인
[ ] Heartbeat 30초 간격 동작 확인
[ ] 재연결 3회 retry + 지수 backoff 동작 확인
[ ] fatalError 상태 — 페이지 리로드 안내 UI 존재 확인
[ ] Race Condition — Mutex 적용 및 release() finally 블록 확인
[ ] nginx proxy_buffering off 적용 확인
[ ] curl URL 토큰 테스트 통과 확인
```

---

*Skill Level: 4 (Tool & Validation) | Red-Team Verified | MP Stock Discovery v3.0*
