'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { GoogleGenerativeAI }  = require('@google/generative-ai');
const { PrismaClient }        = require('@prisma/client');
const redis                   = require('./platform/infra/redis/client.cjs');
const { calcPPPForStock }     = require('./ppp_filter.cjs');

const prisma = new PrismaClient();
// const redis  = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
// redis.connect().catch(e => console.warn('[PPPGemini] Redis 연결 실패:', e.message));

const SIGNALS_PATH     = path.join(process.cwd(), 'data/signals.json');
const STRATEGY_REPORT_PATH = path.join(process.cwd(), 'data/watchlist_strategy.json');
const SCORE_THRESHOLD  = 75;
const TOP_N            = 10;
const PPP_BATCH_SIZE   = 4;
const PPP_BATCH_DELAY  = 150; // ms + jitter

// ── [C-02] 투자 권유 금지 필터 ───────────────────────────────────────────────
const FORBIDDEN = [
  '매수 추천','매수하세요','사세요','투자하세요','지금 사야',
  '수익 보장','확실한 수익','반드시 오릅니다','강력 추천',
  '매도 추천','지금 팔아야',
];
function filterForbidden(text) {
  return FORBIDDEN.reduce((t, p) => t.replaceAll(p, '[기술적분석]'), text ?? '');
}

// ── KRX tick 단위 반올림 ──────────────────────────────────────────────────────
function roundTick(price) {
  const p = Math.round(price);
  if (p < 1000)   return p;
  if (p < 5000)   return Math.round(p / 5)    * 5;
  if (p < 10000)  return Math.round(p / 10)   * 10;
  if (p < 50000)  return Math.round(p / 50)   * 50;
  if (p < 100000) return Math.round(p / 100)  * 100;
  if (p < 500000) return Math.round(p / 500)  * 500;
  return Math.round(p / 1000) * 1000;
}

// ── [M-03] JSON 안전 파싱 ────────────────────────────────────────────────────
function safeParseJSON(raw) {
  const cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
  const match   = cleaned.match(/(\[[\s\S]*\])/);
  if (!match) throw new Error('JSON 배열 추출 실패: ' + cleaned.slice(0, 80));
  return JSON.parse(match[1]);
}

// ── signals.json 로드 ─────────────────────────────────────────────────────────
function loadSignals() {
  if (!fs.existsSync(SIGNALS_PATH)) throw new Error('signals.json 없음');
  return JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf8'));
}

// ── [N-01] atomic write ───────────────────────────────────────────────────────
function writeSignalsAtomic(data) {
  const tmp = SIGNALS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, SIGNALS_PATH);
}

// ── [M-05] current_price 필드 탐색 ───────────────────────────────────────────
function extractCurrentPrice(stock) {
  return stock.current_price
      ?? stock.currentPrice
      ?? stock.close
      ?? stock.stck_prpr
      ?? stock.price
      ?? 0;
}

// ── 75점↑ 종목 추출 ──────────────────────────────────────────────────────────
function loadHighScoreTargets(signals) {
  const all = Object.values(signals).map(s => ({ 
    ...s, 
    ticker: s.code || s.ticker,
    bestScore: s.totalScore || s.score || 0
  }));
  
  const filtered = all.filter(s => s.bestScore >= SCORE_THRESHOLD);
  console.log(`[PPPGemini] Filtering: Total ${all.length} -> HighScore(${SCORE_THRESHOLD}↑) ${filtered.length}`);
  
  return filtered.sort((a, b) => b.bestScore - a.bestScore);
}

// ── [M-02] matched_tfs 파싱 (JSON 문자열 또는 배열 모두 처리) ─────────────────
function parseMatchedTfs(matched_tfs) {
  if (Array.isArray(matched_tfs)) return matched_tfs;
  if (typeof matched_tfs === 'string') {
    try { return JSON.parse(matched_tfs); } catch { return []; }
  }
  return [];
}

// ── Top10 선정 ───────────────────────────────────────────────────────────────
// 정렬: ① matched_tfs 수 내림차순 → ② 동점 시 totalScore 내림차순
function selectTop10(pppResults) {
  return [...pppResults]
    .sort((a, b) => {
      const tfDiff = parseMatchedTfs(b.matched_tfs).length
                   - parseMatchedTfs(a.matched_tfs).length;
      if (tfDiff !== 0) return tfDiff;
      return (b.totalScore ?? 0) - (a.totalScore ?? 0);
    })
    .slice(0, TOP_N);
}

// ── Gemini 1회 호출 (Top10 배치) ─────────────────────────────────────────────
async function callGeminiTop10(top10, model) {
  const payload = top10.map(s => ({
    ticker:       s.code ?? s.ticker,
    name:         s.name ?? s.code ?? s.ticker,
    totalScore:   s.totalScore ?? s.score,
    currentPrice: extractCurrentPrice(s),
    ppp1:         s.ppp1,
    ppp2:         s.ppp2,
    gBuy:         s.g_buy ? Math.round(s.g_buy) : null,
    gSell:        s.g_sell ? Math.round(s.g_sell) : null,
    result2:      s.result_2 ? Math.round(s.result_2) : null,
    matched_tfs:  parseMatchedTfs(s.matched_tfs),
    tf_values:    (() => {
      if (typeof s.tf_values === 'object' && !Array.isArray(s.tf_values)) return s.tf_values;
      try { return JSON.parse(s.tf_values ?? '{}'); } catch { return {}; }
    })(),
  }));

  // [C-02] 투자 권유 금지 명시
  const prompt = `
당신은 한국 주식 기술적 분석가입니다.
아래 종목들은 멀티 타임프레임 BBMacd/PPP 필터를 통과한 종목입니다.
PPP 분석 결과를 바탕으로 각 종목의 기술적 가격 레벨을 산출하세요.

⚠️ 필수 준수 사항 (위반 시 법적 문제 발생):
- 투자 추천·매수·매도 권유 문구 절대 금지 (금융투자업에 관한 법률 제55조)
- 순수 기술적 분석 근거만 서술 (gSell/result_2/PPP 상태 기반)
- entry_price_1 ≤ currentPrice (단, PPP2면 result_2 기준 조정 가능)
- entry_price_2 < entry_price_1
- stop_loss < entry_price_2
- target_price > currentPrice
- 모든 가격: 양의 정수 (KRX tick 단위)
- rationale: 한국어 100자 이내, 기술적 분석 근거만

PPP 분석 데이터 (JSON):
${JSON.stringify(payload, null, 2)}

ppp1: true = PPP1 조건 통과 (mid > gSell AND bgUp)
ppp2: true = PPP2 조건 통과 (PPP1 AND result_2 ≥ gSell)
gSell: G-Sell 저항선 가격
result_2: 지지선 가격
matched_tfs: PPP 조건 통과한 타임프레임 목록
tf_values: 각 TF별 gSell/result_2

응답 형식 — JSON 배열만 출력 (마크다운, 설명, 코드블록 없이):
[{"ticker":"","entry_price_1":0,"entry_price_2":0,"stop_loss":0,"target_price":0,"rationale":""}]
`.trim();

  const result = await model.generateContent(prompt);
  return safeParseJSON(result.response.text());
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 함수: runPppGeminiScan
// ─────────────────────────────────────────────────────────────────────────────
async function runPppGeminiScan() {
  // [C-01] 전체 try-catch — 실패해도 동기화 파이프라인에 영향 없음
  try {
    // [M-01] 분산 락 (ioredis string args 사용)
    const LOCK_KEY   = 'lock:ppp_scan_sync';
    const lockAcquired = await redis.set(LOCK_KEY, '1', 'EX', 600, 'NX');
    if (!lockAcquired) {
      console.log('[PPPGemini] 이미 실행 중 — 스킵');
      return { skipped: true };
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('[PPPGemini] GEMINI_API_KEY 없음 — 스킵');
        return { skipped: true, reason: 'NO_API_KEY' };
      }

      // [C-03] signals.json 로드 (동기화 완료 후 갱신된 파일)
      const signals = loadSignals();
      const targets = loadHighScoreTargets(signals);

      // [M-04] 0개 처리
      if (targets.length === 0) {
        console.log('[PPPGemini] 75점↑ 종목 없음 — 스킵');
        return { skipped: true, reason: 'NO_TARGETS' };
      }

      console.log(`[PPPGemini] 시작 — 75점↑ ${targets.length}종목 PPP 계산`);

      // ── Step 1: 전체 PPP 계산 (BATCH_SIZE=4) ─────────────────────────────
      const pppResults = [];
      for (let i = 0; i < targets.length; i += PPP_BATCH_SIZE) {
        const batch = targets.slice(i, i + PPP_BATCH_SIZE);
        const batchOut = await Promise.all(
          batch.map(s => calcPPPForStock({
            code:   s.ticker || s.code,
            name:   s.name ?? s.ticker ?? s.code,   // [N-02]
            score:  s.totalScore ?? s.score,
            market: s.market || 'KR_STOCK',
          }).catch(e => {
            console.warn(`[PPPGemini] ${s.ticker} PPP 실패:`, e.message);
            return null;
          }))
        );

        // null 제거 후 totalScore 주입 (calcPPPForStock 반환값에 없을 수 있음)
        for (const res of batchOut) {
          if (!res) continue;
          const original = targets.find(t => t.ticker === res.code);
          pppResults.push({
            ...res,
            totalScore: original?.totalScore ?? 0,
            name:       original?.name ?? res.code,
          });
        }

        const done = Math.min(i + PPP_BATCH_SIZE, targets.length);
        console.log(`[PPPGemini] PPP ${done}/${targets.length} 완료`);

        if (i + PPP_BATCH_SIZE < targets.length) {
          const jitter = Math.floor(Math.random() * 200);
          await new Promise(r => setTimeout(r, PPP_BATCH_DELAY + jitter));
        }
        if (global.gc) global.gc();
      }

      console.log(`[PPPGemini] PPP 계산 완료 — 결과 ${pppResults.length}건`);

      // ── Step 2: Top10 선정 ────────────────────────────────────────────────
      const top10 = selectTop10(pppResults);
      console.log(`[PPPGemini] Top10 선정:`);
      top10.forEach((s, i) => {
        const tfs = parseMatchedTfs(s.matched_tfs);
        console.log(`  ${i+1}. ${s.name}(${s.code}) TF매치:${tfs.length}개 점수:${s.totalScore} PPP2:${s.ppp2}`);
      });

      // ── Step 3: Gemini 1회 호출 ───────────────────────────────────────────
      console.log('[PPPGemini] Gemini Flash 1.5 호출 (1회, 10종목)');
      const genAI = new GoogleGenerativeAI(apiKey);
      // [TASK-009] 가용 모델(flash-latest) 사용
      const model = genAI.getGenerativeModel(
        { model: 'gemini-flash-latest' },
        { apiVersion: 'v1beta' }
      );

      // Redis 일일 호출 카운터
      const today = new Date().toISOString().slice(0, 10);
      await redis.incr(`mp:gemini:calls:${today}`).catch(() => {});
      await redis.expire(`mp:gemini:calls:${today}`, 86400 * 7).catch(() => {});

      let geminiResults = [];
      try {
        geminiResults = await callGeminiTop10(top10, model);
        console.log(`[PPPGemini] Gemini 응답 ${geminiResults.length}건`);
      } catch (geminiErr) {
        console.error('[PPPGemini] Gemini 호출 실패:', geminiErr.message);
        // Gemini 실패해도 PPP 결과는 저장 계속
      }

      // Gemini 결과 맵
      const geminiMap = new Map(geminiResults.map(r => [r.ticker, r]));

      // ── Step 4: 저장 ──────────────────────────────────────────────────────
      const updatedSignals = { ...signals };
      const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const upsertTasks = [];

      for (const pppItem of top10) {
        const ticker     = pppItem.code;
        const geminiItem = geminiMap.get(ticker);
        const currentPrice = extractCurrentPrice(pppItem);

        // ── signals.json 갱신 ──
        const sigKey = Object.keys(updatedSignals).find(
          k => (updatedSignals[k].ticker ?? k) === ticker
        );
        if (sigKey) {
          updatedSignals[sigKey] = {
            ...updatedSignals[sigKey],
            ppp_result: {
              ppp1:         pppItem.ppp1,
              ppp2:         pppItem.ppp2,
              g_sell:       pppItem.g_sell,
              result_2:     pppItem.result_2,
              matched_tfs:  parseMatchedTfs(pppItem.matched_tfs),
              tf_count:     parseMatchedTfs(pppItem.matched_tfs).length,
              scanned_at:   new Date().toISOString(),
            },
            gemini_scan: geminiItem ? {
              entry_price_1: roundTick(geminiItem.entry_price_1),
              entry_price_2: roundTick(geminiItem.entry_price_2),
              stop_loss:     roundTick(geminiItem.stop_loss),
              target_price:  roundTick(geminiItem.target_price),
              rationale:     filterForbidden(geminiItem.rationale),
              scanned_at:    new Date().toISOString(),
            } : null,
          };
        }

        // ── pppWatchlist DB upsert ──
        upsertTasks.push(
          prisma.pppWatchlist.upsert({
            where: {
              code_registered_date: {
                code:            ticker,
                registered_date: todayStr,
              }
            },
            update: {
              score:            pppItem.totalScore ?? pppItem.score,
              ppp1:             pppItem.ppp1,
              ppp2:             pppItem.ppp2,
              g_sell:           pppItem.g_sell,
              result_2:         pppItem.result_2,
              matched_tfs:      JSON.stringify(parseMatchedTfs(pppItem.matched_tfs)),
              tf_values:        typeof pppItem.tf_values === 'string'
                                  ? pppItem.tf_values
                                  : JSON.stringify(pppItem.tf_values ?? {}),
              current_price:    currentPrice,
              price_updated_at: new Date(),
              is_active:        true,
              last_signal:      pppItem.ppp2 ? 'PPP2' : 'PPP1',
              updated_at:       new Date(),
              // Gemini 컬럼 (Step 1 마이그레이션 후 활성화)
              ...(geminiItem ? {
                gemini_entry_1:    roundTick(geminiItem.entry_price_1),
                gemini_entry_2:    roundTick(geminiItem.entry_price_2),
                gemini_stop_loss:  roundTick(geminiItem.stop_loss),
                gemini_target:     roundTick(geminiItem.target_price),
                gemini_rationale:  filterForbidden(geminiItem.rationale),
                gemini_scanned_at: new Date(),
              } : {}),
            },
            create: {
              code:            ticker,
              name:            pppItem.name ?? ticker,
              score:           pppItem.totalScore ?? pppItem.score ?? 0,
              ppp1:            pppItem.ppp1,
              ppp2:            pppItem.ppp2,
              g_sell:          pppItem.g_sell,
              result_2:        pppItem.result_2,
              matched_tfs:     JSON.stringify(parseMatchedTfs(pppItem.matched_tfs)),
              tf_values:       typeof pppItem.tf_values === 'string'
                                 ? pppItem.tf_values
                                 : JSON.stringify(pppItem.tf_values ?? {}),
              current_price:   currentPrice,
              price_updated_at: new Date(),
              registered_date: todayStr,
              expires_at:      expiresAt,
              is_active:       true,
              last_signal:     pppItem.ppp2 ? 'PPP2' : 'PPP1',
              last_signal_changed: new Date(),
              ...(geminiItem ? {
                gemini_entry_1:    roundTick(geminiItem.entry_price_1),
                gemini_entry_2:    roundTick(geminiItem.entry_price_2),
                gemini_stop_loss:  roundTick(geminiItem.stop_loss),
                gemini_target:     roundTick(geminiItem.target_price),
                gemini_rationale:  filterForbidden(geminiItem.rationale),
                gemini_scanned_at: new Date(),
              } : {}),
            },
          }).catch(e => console.warn(`[PPPGemini] DB upsert 실패 ${ticker}:`, e.message))
        );
      }

      await Promise.all(upsertTasks);
      console.log(`[PPPGemini] DB upsert 완료 — ${top10.length}건`);

      // ── Step 5: 리모트 리포트용 정적 JSON 생성 ──
      const strategyPayload = {
        updatedAt: new Date().toISOString(),
        version: "9.8.9",
        stocks: top10.map(s => {
          const gemini = geminiMap.get(s.code);
          return {
            id:            `ppp-${s.code}`,
            code:          s.code,
            name:          s.name,
            score:         s.totalScore ?? s.score,
            market:        s.market || 'KR_STOCK',
            timeframe:     'MTF',
            current_price: extractCurrentPrice(s),
            entry_1:       gemini ? roundTick(gemini.entry_price_1) : (s.result_2 || 0),
            entry_2:       gemini ? roundTick(gemini.entry_price_2) : Math.round((s.result_2 || s.current_price) * 0.95), // Fallback: 지지선 -5%
            target:        gemini ? roundTick(gemini.target_price) : (s.g_sell || 0),
            stop_loss:     gemini ? roundTick(gemini.stop_loss) : Math.round((s.result_2 || s.current_price) * 0.92),    // Fallback: 지지선 -8%
            rationale:     gemini ? filterForbidden(gemini.rationale) : '기술적 반등 및 수급 개선 시그널 발생 (AI 분석 대기 중)',
            is_ai_generated: !!gemini,
            chartUrl:      `https://www.tradingview.com/chart/?symbol=KRX:${s.code}`,
            metrics: {
                adx: s.adx ? Math.round(s.adx * 10) / 10 : 20,
                bbw: s.bbw ? Math.round(s.bbw) : 100,
                ma: s.maArrangement || 'N/A',
                volTrigger: s.trigger_vol || false
            }
          };
        })
      };

      fs.writeFileSync(STRATEGY_REPORT_PATH, JSON.stringify(strategyPayload, null, 2), 'utf8');
      console.log(`[PPPGemini] 전략 리포트 파일 생성 완료: ${STRATEGY_REPORT_PATH}`);

      // [N-01] signals.json atomic write
      writeSignalsAtomic(updatedSignals);
      console.log('[PPPGemini] signals.json 갱신 완료');

      return {
        success:    true,
        pppTotal:   pppResults.length,
        top10:      top10.map(s => s.code),
        geminiDone: geminiResults.length,
      };

    } finally {
      await redis.del(LOCK_KEY);
    }

  } catch (e) {
    // [C-01] 최상위 catch — 동기화 파이프라인에 절대 예외 전파 없음
    console.error('[PPPGemini] 실패 (동기화는 정상 완료):', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { runPppGeminiScan };
