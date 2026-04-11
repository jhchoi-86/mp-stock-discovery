# sniper_engine/pipeline/init_task.py
import logging
import os
import json
from redis.asyncio import Redis, from_url
from sniper_engine.state import STATE

logger = logging.getLogger("InitTask")
logger.setLevel(logging.INFO)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

async def run_init_task(targets=None):
    """
    🔵 [Blue Team] 08:30 장전 초기화 (Task 2.1)
    DB/Redis에서 넘겨받은 당일 스윙 타겟 종목을 인메모리 STATE로 로드합니다.
    """
    if not targets:
        # 하드코딩된 더미 테스트 타겟 (Phase 2 개발용)
        targets = ["000660", "005930", "035420", "035720", "000270", "005380"]
    
    # [v9.0.9] Load strategy to get real baseline prices even if strings are passed
    strategy_data = {}
    strategy_path = os.path.join(os.path.dirname(__file__), "../../data/landing_strategy.json")
    if os.path.exists(strategy_path):
        try:
            with open(strategy_path, 'r', encoding='utf-8') as f:
                strategy = json.load(f)
                for s in strategy.get('stocks', []):
                    strategy_data[s['code']] = s
        except Exception:
            pass

    # 🔴 [Red Team 방어] KeyError 방지를 위해 순회하며 딕셔너리 키 구조 사전(Pre-allocate) 할당.
    for ticker_data in targets:
        if isinstance(ticker_data, dict):
            ticker = ticker_data['code']
            name = ticker_data.get('name', ticker)
            s_info = ticker_data
        else:
            ticker = str(ticker_data)
            s_info = strategy_data.get(ticker, {})
            name = s_info.get('name', ticker)
            
        # [v9.0.9] Use REAL baseline prices to avoid score blocking
        real_open = int(s_info.get('openPrice', s_info.get('currentPrice', 25000)))
        real_prev = int(s_info.get('prevClose', real_open))

        STATE['baseline'][ticker] = {
            "name": name,
            "open": real_open, 
            "prev_close": real_prev, 
            "prev_vol": int(s_info.get('volume', 50000))
        }
        STATE['vwap'][ticker] = 0.0
        STATE['cumulative_vol'][ticker] = 0
        STATE['buy_ticks'][ticker] = 0
        STATE['sell_ticks'][ticker] = 0
        STATE['ask_vol_sum'][ticker] = 0
        STATE['bid_vol_sum'][ticker] = 0
        
    # 🔴 [Red Team 누락 보완] WBS 3.2: 커넥션 드랍/서버 셧다운 후 재가동 시 Redis에 남겨진 포지션 강제 복원
    try:
        redis_pool = from_url(REDIS_URL, decode_responses=True, socket_timeout=0.1)
        
        pos_keys = await redis_pool.keys("pos:*")
        restored_count = 0
        for key in pos_keys:
            sig_id = key.split("pos:")[1]
            pos_data = await redis_pool.hgetall(key)
            if pos_data:
                STATE['virtual_pos'][sig_id] = pos_data
                restored_count += 1
                
        if restored_count > 0:
            logger.warning(f"🔴 [Red Team Recovery] Successfully restored {restored_count} active positions from Redis Backup!")
            
        await redis_pool.aclose()
    except Exception as e:
        logger.error(f"🔴 [Red Team] Redis position restore failed: {e}")

    logger.info(f"[Init Task] Initialized {len(targets)} targets into memory.")
    return targets
