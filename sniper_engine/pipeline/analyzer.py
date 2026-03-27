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
            
            # 🔴 [Red Team 방어] 장 마감 시간(15:15:00) 이후 모든 연산 강제 중단 (동시호가 왜곡 타점 무시)
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
                STATE['rolling_vol'][ticker] = deque(maxlen=30) # 10초 * 30 = 300초(5분) 메모리 방어 캡슐
                window_accumulation[ticker] = 0
                current_windows[ticker] = window_idx

            if window_idx > current_windows[ticker]:
                # 🔵 새로운 10초 버킷으로 넘어감. 직전 버킷을 데크에 넣고 초기화
                STATE['rolling_vol'][ticker].append(window_accumulation[ticker])
                window_accumulation[ticker] = 0
                current_windows[ticker] = window_idx
            
            window_accumulation[ticker] += net_buy
            
            # --- 수급 스코어링 & 타점 판독 로직 ---
            rolling_queue = STATE['rolling_vol'][ticker]
            
            # 데이터가 50초(윈도우 5개) 이상 쌓였을 때부터 유효 판단 시작
            if len(rolling_queue) >= 5: 
                past_5m_avg_net_buy = sum(rolling_queue) / len(rolling_queue)
                current_net_buy = window_accumulation[ticker]
                
                # 1. 10초 윈도우 내 순매수 대금이 3,000만 원 이상 터졌는가 (소형주 잡음 필터)
                if current_net_buy >= 30_000_000:
                    multiplier = (current_net_buy / past_5m_avg_net_buy) if past_5m_avg_net_buy > 0 else 999.0
                    
                    # 2. 거래대금이 평소(직전 5분)보다 300% 이상 폭주했는가
                    if multiplier >= 3.0:
                        vwap_val = STATE['vwap'].get(ticker, 0)
                        
                        # 3. 🔵 [Blue Team] Phase 7 Advanced Scoring Engine 가동
                        baseline = STATE['baseline'].get(ticker, {})
                        score_data = {
                            "open": baseline.get("open", baseline.get("prev_close", price)),
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
                        
                        # 4. 🔴 [Red Team 방어] 무지성 진입 차단. C/B등급 무시, 오직 S, A 등급(300점 이상)만 승인 (v5.1.0)
                        if total_score >= 300 and price >= vwap_val and is_buy and ticker not in STATE.get('active_tickers', set()):

                            # 🔵 [Immediate Lock] 중복 신호 폭발 방지 (v4.8.0)
                            STATE.get('active_tickers', set()).add(ticker)
                            
                            signal_id = f"SIG_{ticker}_{uuid.uuid4().hex[:8]}"

                            alert_payload = {
                                "signal_id": signal_id,
                                "type": "ENTRY",
                                "ticker": ticker,
                                "price": price,   # 보수적 관점의 당장 매도가(Ask1 돌파)
                                "time": time_str,
                                "grade": grade,
                                "score": total_score,
                                "momentum": {
                                    "net_buy_krw": current_net_buy,
                                    "multiplier": round(multiplier, 2)
                                }
                            }
                            # 🔴 [Red Team 핫픽스] 쟁탈전 방지를 위해 Tracker와 Broadcaster에 별도로 명시적 동시 투하 (Fan-out)
                            await TRACKER_QUEUE.put(alert_payload)
                            await BROADCAST_QUEUE.put(alert_payload)
                            logger.info(f"💣 ENTRY FIRED: {ticker} [Grade {grade}] (Score {total_score}) -> {signal_id}")
                            
                            # 중복 폭발 알람을 막기 위해 현재 윈도우 스코어 즉시 냉각
                            window_accumulation[ticker] = 0

            TICK_QUEUE.task_done()
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"🔴 Analyzer Critical Exception: {e}")
            try:
                TICK_QUEUE.task_done()
            except ValueError:
                pass
