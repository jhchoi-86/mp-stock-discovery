# SKILL: API Server & SSE (server.cjs)
# MP Stock Discovery v9.4.25 | MetaPrompt Studio
# Rev: Blue/Red Team Audit v1.1
# 적용 범위: server.cjs, SSE, JWT, KIS API, Telegram, useStockManager.js 관련 작업

---

## 🎯 이 스킬을 사용할 때

Claude Code가 다음 작업을 요청받은 경우 이 스킬을 먼저 참조:
- server.cjs API 라우터 추가/수정
- SSE(Server-Sent Events) 관련 로직
- JWT 인증 미들웨어
- KIS API 연동 코드 (토큰 갱신 포함)
- Telegram 봇 알림 코드
- React useStockManager.js 수정
- WebSocket / SSE 연결 관리

---

## 🖥️ server.cjs 구조 원칙

```
server.cjs
├── Express 앱 초기화
├── JWT 인증 미들웨어 (모든 /api/* 라우트)
├── SSE 엔드포인트 (/api/stream)
├── REST API 라우터 (/api/signals, /api/status 등)
├── tdrGate.cjs 연동 (신호 저장 전)
└── PM2 fork 모드 단일 인스턴스 (cluster 금지 — SSE 단절)
```

> ⚠️ PM2 cluster 모드 절대 금지 — SSE는 단일 프로세스 연결이므로 cluster 사용 시 클라이언트 연결 단절

---

## 📡 SSE 구현 패턴 (heartbeat 포함)

```javascript
// ✅ SSE 엔드포인트 표준 패턴 (heartbeat 포함)
app.get('/api/stream', authenticateJWT, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx 버퍼링 비활성화

  // 고유 클라이언트 ID (충돌 방지)
  const clientId = crypto.randomUUID(); // Date.now() 대신 사용
  clients.set(clientId, res);

  // ✅ heartbeat — Nginx/프록시 타임아웃 방지 (30초 주기)
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  // 연결 해제 처리 (메모리 누수 방지)
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
});

// ✅ SSE 브로드캐스트 (5분 주기)
function broadcastSignals(data) {
  clients.forEach((res) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}
```

---

## 🔐 JWT 인증 패턴 (에러 구분 포함)

```javascript
const jwt = require('jsonwebtoken');

function authenticateJWT(req, res, next) {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // ✅ 로그 마스킹 필수
    const safeUrl = req.url.replace(/token=[^&]+/, 'token=***');
    console.log(`Auth OK: ${safeUrl}`);
    next();

  } catch (err) {
    // ✅ 만료 vs 위조 구분 (보안 감사 로그)
    if (err.name === 'TokenExpiredError') {
      console.warn(`Token expired: ${req.ip}`);
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error(`Invalid token attempt: ${req.ip}`); // 보안 감사 로그
    return res.status(403).json({ error: 'Invalid token' });
  }
}
```

---

## 🏦 KIS API 토큰 관리 (race condition 방지)

**토큰 파일**: `data/kis_token.json`

```javascript
let isRefreshing = false;
let refreshQueue = [];

async function getKISToken() {
  if (isRefreshing) {
    return new Promise((resolve, reject) => refreshQueue.push({ resolve, reject }));
  }

  const token = readTokenFromFile();
  if (!isExpired(token)) return token;

  isRefreshing = true;
  try {
    const newToken = await refreshKISToken();
    // 대기 중인 요청 모두 성공 처리
    refreshQueue.forEach(({ resolve }) => resolve(newToken));
    refreshQueue = [];
    return newToken;
  } catch (err) {
    // ✅ 갱신 실패 시 대기 요청 모두 에러 전파
    refreshQueue.forEach(({ reject }) => reject(err));
    refreshQueue = [];
    throw err;
  } finally {
    isRefreshing = false;
  }
}
```

> ⚠️ catch 블록 필수 — 갱신 실패 시 대기 큐 처리 없으면 영구 블로킹 발생

---

## 📬 Telegram 알림 패턴

```javascript
// ✅ chatId는 반드시 .env 참조
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // 하드코딩 금지

async function sendSignalAlert(signal) {
  const message = [
    `📊 신호 감지: ${signal.ticker}`,
    `등급: ${signal.grade} ${'★'.repeat(signal.stars)}`,
    `타임프레임: ${Object.entries(signal.timeframes).filter(([,v])=>v).map(([k])=>k).join(', ')}`,
    `⚠️ 본 신호는 참고용이며 투자 판단은 본인 책임입니다.` // 면책 문구 필수
  ].join('\n');

  await bot.sendMessage(TELEGRAM_CHAT_ID, message);
}

// ❌ 금지 문구 예시
// "강력 매수 추천", "수익 보장", "지금 당장 매수"
```

---

## ⚛️ useStockManager.js (React 전역 상태)

**경로**: `src/hooks/useStockManager.js`

```javascript
// SSE 연결 및 signals.json 구조 의존
// signals 구조: { ticker, grade, stars, timeframes(30M/1H/2H/4H/1D/2D/1W), bbw, timestamp }

useEffect(() => {
  const es = new EventSource(`/api/stream?token=${token}`);
  es.onmessage = (e) => setSignals(JSON.parse(e.data));
  es.onerror = () => es.close(); // 에러 시 재연결 로직

  return () => es.close(); // ✅ cleanup 필수 (StrictMode 더블 마운트 대응)
}, [token]);
```

**수정 규칙:**
- signals.json 스키마 변경 시 반드시 동반 수정
- SSE 연결 해제/재연결 로직 유지 (네트워크 불안정 대비)
- React StrictMode 더블 마운트 대응 (`useEffect` cleanup 필수)

---

## ✅ API 서버 작업 체크리스트

- [ ] 신규 라우터 → JWT 미들웨어 적용 확인
- [ ] 로그 출력 → 토큰/키 마스킹 처리
- [ ] KIS API 로직 → race condition 방지 패턴 (catch 블록 포함)
- [ ] SSE 엔드포인트 → heartbeat 30초 설정
- [ ] SSE clientId → crypto.randomUUID() 사용
- [ ] Telegram chatId → process.env.TELEGRAM_CHAT_ID 참조
- [ ] Telegram 메시지 → 면책 문구 포함, 투자 권유 문구 없음
- [ ] SSE 연결 해제 → clearInterval(heartbeat) + clients.delete(clientId)
- [ ] server.cjs 수정 → Blue/Red Team 검토 요청

---

## ⚠️ 절대 금지 사항

1. PM2 cluster 모드 적용 (SSE 단절)
2. JWT_SECRET 하드코딩
3. KIS 토큰 갱신 race condition (catch 블록 없는 mutex 패턴)
4. SSE heartbeat 없는 장시간 연결 (Nginx 타임아웃 단절)
5. clientId = Date.now() (동시 접속 충돌)
6. TELEGRAM_CHAT_ID 하드코딩
7. 투자 권유 문구가 포함된 API 응답 생성
