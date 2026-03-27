import asyncio
import logging
import os
from redis.asyncio import Redis, from_url
from sniper_engine.state import STATE, TRACKER_QUEUE, BROADCAST_QUEUE

logger = logging.getLogger("TrackerTask")
logger.setLevel(logging.INFO)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

async def tracker_task():
    """
    🔵 [Blue Team] 청산 추적 경고 로직 (Task 3.2)
    ALERT_QUEUE에서 발생한 ENTRY 포지션을 `STATE['virtual_pos'][id]` 로 이관 후,
    이후 틱 데이터(`last_price`)를 1초마다 폴링하며 손익절 컷오프를 감시합니다.
    """
    logger.info("Starting Tracker Task (Exit Management)...")
    # 🔴 [Red Team 방어] Redis 커넥션 타임아웃 0.1초 부여 (백테스트 스피드업 목적)
    redis_pool = from_url(REDIS_URL, decode_responses=True, socket_timeout=0.1)
    
    if 'last_price' not in STATE:
        STATE['last_price'] = {}
        
    while True:
        try:
            # 1. 큐 감시 (0.5초 대기. 블로킹하지 않고 주기적으로 폴링 로직으로 점프)
            try:
                alert = await asyncio.wait_for(TRACKER_QUEUE.get(), timeout=0.5)
                if alert['type'] == 'ENTRY':
                    sig_id = alert['signal_id']
                    ticker = alert['ticker']
                    entry_price = alert['price']
                    
                    pos_data = {
                        "ticker": ticker,
                        "entry": str(entry_price),
                        "target": str(entry_price * 1.03), # 3.0% 익절
                        "stop": str(entry_price * 0.985)   # -1.5% 손절
                    }
                    STATE['virtual_pos'][sig_id] = pos_data
                    
                    if not STATE.get('is_backtest'):
                        try:
                            # 🔴 [Red Team 방어] 프로세스 OOM 킬(kill) 시 포지션 리스트 공중분해 방지용 Redis 안전망 hset 캐싱
                            await redis_pool.hset(f"pos:{sig_id}", mapping=pos_data)
                        except Exception as e:
                            logger.warning(f"Tracker Redis Backup Failed (Skipping): {e}")

                    logger.info(f"🛡️ Position Tracked: {ticker} [{sig_id}] | Target: {pos_data['target']} | Stop: {pos_data['stop']}")
                    
                TRACKER_QUEUE.task_done()
            except asyncio.TimeoutError:
                pass # 큐가 비어있으면 조용히 2단계로 넘어감
                
            # 2. 보유 포지션 엑시트 폴링 평가 (1초 단위)
            # 🔴 [Red Team 치명적 에러 방지] 딕셔너리를 순회하는 동안 항목이 지워지만(Error: dictionary changed size) 런타임 크래시가 나므로, list() 래핑(Deep Copy 뷰) 필수!
            keys_to_delete = []
            for sig_id, pos in list(STATE['virtual_pos'].items()):
                ticker = pos['ticker']
                cur_price = STATE['last_price'].get(ticker, 0)
                if cur_price == 0:
                    continue
                
                target_p = float(pos['target'])
                stop_p = float(pos['stop'])
                vwap_p = STATE['vwap'].get(ticker, 0)
                
                exit_reason = None
                
                if cur_price >= target_p:
                    exit_reason = f"TARGET_MET_3_PC"
                    logger.warning(f"🎯 [Take Profit] {ticker} ({sig_id}) hit {cur_price}")
                elif cur_price <= stop_p:
                    exit_reason = f"STOP_LOSS_1.5_PC"
                    logger.warning(f"🚨 [Stop Loss] {ticker} ({sig_id}) hit {cur_price}")
                elif vwap_p > 0 and cur_price < vwap_p:
                    exit_reason = f"VWAP_BROKEN"
                    logger.warning(f"🚨 [VWAP Broken] {ticker} ({sig_id}) dropped below VWAP. Cur: {cur_price}")

                if exit_reason:
                    keys_to_delete.append(sig_id)

            # 가비지 컬렉션 (GC) 및 Broadcaster용 경고 빔 전송
            for sig_id in keys_to_delete:
                ticker = STATE['virtual_pos'][sig_id]['ticker']
                del STATE['virtual_pos'][sig_id]
                
                # 🔵 [Unlock Signal] v4.8.0 리밸런싱을 위해 락 해제
                if ticker in STATE.get('active_tickers', set()):
                    STATE.get('active_tickers', set()).remove(ticker)
                    logger.info(f"🔓 [Signal Unlocked] {ticker} is now eligible for new recommendations.")

                if not STATE.get('is_backtest'):
                    try:
                        await redis_pool.delete(f"pos:{sig_id}")
                    except Exception:
                        pass
                
                await BROADCAST_QUEUE.put({
                    "type": "EXIT_WARN", 
                    "signal_id": sig_id, 
                    "ticker": ticker,
                    "reason": exit_reason,
                    "price": float(cur_price)  # 🔴 [Red Team 핫픽스] 백테스터 Metrics 정산을 위해 청산 실행가(Price) 기명 필수!
                })

            if not STATE.get('is_backtest'):
                await asyncio.sleep(0.5) 
            else:
                await asyncio.sleep(0) # Yield for other tasks but don't wait
                
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"🔴 Tracker Critical Exception: {e}")
            # Ensure task_done is called if we were in the middle of processing an alert
            try:
                TRACKER_QUEUE.task_done()
            except ValueError:
                pass
            await asyncio.sleep(1)
