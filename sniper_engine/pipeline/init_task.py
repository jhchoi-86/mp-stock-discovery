# sniper_engine/pipeline/init_task.py
import logging
import os
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
    
    # 🔴 [Red Team 방어] KeyError 방지를 위해 순회하며 딕셔너리 키 구조 사전(Pre-allocate) 할당.
    for ticker in targets:
        # 백테스트(Mock Generator) 구동을 고려해 평범한 기준가/볼륨 할당
        STATE['baseline'][ticker] = {"open": 25000, "prev_close": 24000, "prev_vol": 50000}
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
