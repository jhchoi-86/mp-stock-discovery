import asyncio
import logging
import uuid
from collections import deque
from sniper_engine.state import STATE, TICK_QUEUE, TRACKER_QUEUE, BROADCAST_QUEUE
from sniper_engine.utils.time_utils import hms_to_window_index
from sniper_engine.pipeline.scorer import ScoringEngine

logger = logging.getLogger("AnalyzerTask")
logger.setLevel(logging.INFO)

async def analyzer_task():
    """
    🔵 [Blue Team] 스코어링 로직 (Task 3.1)
    TICK_QUEUE에서 데이터를 꺼내와 10초 윈도우 단위 슬라이딩 롤링 평균(5분치)과 비교,
    극단적 수급 쏠림 현상을 포착해 ENTRY 시그널을 생성합니다.
    """
    logger.info("Starting Analyzer Task (Brain Engine)...")
    
    window_accumulation = {}
    current_windows = {}
    
    if 'last_price' not in STATE:
        STATE['last_price'] = {}
    
    while True:
        try:
            tick = await TICK_QUEUE.get()
            
            ticker = tick.get("code")
            price = int(tick.get("price", 0))
            vol = int(tick.get("volume", 0))
            is_buy = tick.get("is_buy") == "5" # 1은 매도, 5는 매수 체결
            time_str = tick.get("time", "")
            
            if not ticker or not price:
                TICK_QUEUE.task_done()
                continue
            
            # Tracker 구동을 위한 최신 시세 브로드캐스트
            STATE['last_price'][ticker] = price    
            
            # 🔴 [Red Team 방어] 장 마감 시간(15:15:00) 이후 모든 연산 강제 중단
            if time_str >= "151500":
                TICK_QUEUE.task_done()
                continue
                
            # 🔵 [Blue Team] Phase 7 Scoring 지표를 위한 틱 누적 데이터 파싱 및 갱신
            STATE['cumulative_vol'][ticker] = STATE['cumulative_vol'].get(ticker, 0) + vol
            if is_buy:
                STATE['buy_ticks'][ticker] = STATE['buy_ticks'].get(ticker, 0) + 1
                STATE['ask_vol_sum'][ticker] = STATE['ask_vol_sum'].get(ticker, 0) + vol
            else:
                STATE['sell_ticks'][ticker] = STATE['sell_ticks'].get(ticker, 0) + 1
                STATE['bid_vol_sum'][ticker] = STATE['bid_vol_sum'].get(ticker, 0) + vol
            
            window_idx = hms_to_window_index(time_str, window_seconds=10)
            txn_amount = price * vol
            net_buy = txn_amount if is_buy else -txn_amount
            
            if ticker not in STATE['rolling_vol']:
                STATE['rolling_vol'][ticker] = deque(maxlen=30)
                window_accumulation[ticker] = 0
                current_windows[ticker] = window_idx

            if window_idx > current_windows[ticker]:
                # 버킷 롤링
                STATE['rolling_vol'][ticker].append(window_accumulation[ticker])
                window_accumulation[ticker] = 0
                current_windows[ticker] = window_idx
            
            window_accumulation[ticker] += net_buy
            
            # --- 수급 스코어링 & 타점 판독 로직 ---
            rolling_queue = STATE['rolling_vol'][ticker]
            
            if len(rolling_queue) >= 5: 
                past_5m_avg = sum(rolling_queue) / len(rolling_queue)
                current_net_buy = window_accumulation[ticker]
                multiplier = (current_net_buy / past_5m_avg) if past_5m_avg > 0 else 999.0
                
                # [v9.0.9 Logic] 10초 순매수 3천만 & 직전 평균 대비 300% 폭증
                if current_net_buy >= 30_000_000 and multiplier >= 3.0:
                    vwap_val = STATE['vwap'].get(ticker, 0)
                    baseline = STATE['baseline'].get(ticker, {})
                    
                    score_data = {
                        "open": baseline.get("open", price),
                        "prev_close": baseline.get("prev_close", 1),
                        "current_vol": STATE['cumulative_vol'].get(ticker, 0),
                        "avg_prev_5d_vol": baseline.get("prev_vol", 1),
                        "current_price": price,
                        "vwap": vwap_val,
                        "buy_ticks": STATE['buy_ticks'].get(ticker, 0),
                        "sell_ticks": STATE['sell_ticks'].get(ticker, 1),
                        "ask_volume_sum": STATE['ask_vol_sum'].get(ticker, 0),
                        "bid_volume_sum": STATE['bid_vol_sum'].get(ticker, 1)
                    }
                    
                    indicators = ScoringEngine.compute_indicators(score_data)
                    scoring_result = ScoringEngine.calculate_score(indicators)
                    total_score = scoring_result["total_score"]
                    grade = ScoringEngine.get_grade(total_score)
                    
                    is_active = ticker in STATE.get('active_tickers', set())
                    
                    if total_score >= 300 and price >= vwap_val and is_buy and not is_active:
                        # 🎯 타점 적중
                        STATE.get('active_tickers', set()).add(ticker)
                        signal_id = f"SIG_{ticker}_{uuid.uuid4().hex[:8]}"
                        name = baseline.get('name', ticker)

                        alert_payload = {
                            "signal_id": signal_id,
                            "type": "ENTRY",
                            "ticker": ticker,
                            "name": name,
                            "price": price,
                            "time": time_str,
                            "grade": grade,
                            "score": total_score,
                            "momentum": {
                                "net_buy_krw": current_net_buy,
                                "multiplier": round(multiplier, 2)
                            }
                        }
                        await TRACKER_QUEUE.put(alert_payload)
                        await BROADCAST_QUEUE.put(alert_payload)
                        logger.info(f"💣 [Hit] {name} ({ticker}) Score: {total_score} pts")
                        window_accumulation[ticker] = 0
                    else:
                        # [DEBUG] Rejection reasons
                        reasons = []
                        if total_score < 300: reasons.append(f"Score {total_score}")
                        if price < vwap_val: reasons.append("Below VWAP")
                        if not is_buy: reasons.append("Not Buy")
                        if is_active: reasons.append("Active")
                        if reasons:
                            logger.debug(f"[Reject] {ticker}: {', '.join(reasons)}")

            TICK_QUEUE.task_done()
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"🔴 Analyzer Exception: {e}")
            try:
                TICK_QUEUE.task_done()
            except ValueError:
                pass
