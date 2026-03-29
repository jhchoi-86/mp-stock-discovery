# sniper_engine/pipeline/anti_drift.py
import asyncio
import aiohttp
import logging
import time
from sniper_engine.state import STATE

logger = logging.getLogger("AntiDrift")
logger.setLevel(logging.INFO)

async def fetch_price_async(session, target, attempt=0):
    url = f"https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_INPUT={target}"
    try:
        async with session.get(url, timeout=5.0) as resp:
            if resp.status == 200:
                data = await resp.json()
                vwap_val = float(data.get("output", {}).get("stck_prpr", "0"))
                if vwap_val > 0:
                    STATE['vwap'][target] = vwap_val
                    logger.debug(f"{target} VWAP synced effectively.")
                return True
            elif resp.status == 429:
                logger.error(f"🔴 [Red Team] HTTP 429 Too Many Requests for {target}! Firing Backoff.")
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
                    return await fetch_price_async(session, target, attempt + 1)
            return False
    except Exception as e:
        logger.error(f"AntiDrift Crash Blocked for {target}: {e}")
        return False

async def anti_drift_task(targets):
    """
    🔵 [Blue Team] VWAP 강제 동기화 크론잡 (Task 2.3)
    10분(600초)마다 KIS 현재가 REST API를 지속 패치하여 메모리 VWAP 파편화 교정 (Drift 리셋).
    """
    BATCH_SIZE = 4
    while True:
        await asyncio.sleep(600)  # 10분 강제 Sleep 루프
        logger.info("Executing Anti-Drift VWAP Sync...")
        
        async with aiohttp.ClientSession() as session:
            failed_tickers = set()
            for i in range(0, len(targets), BATCH_SIZE):
                batch = targets[i:i + BATCH_SIZE]
                start_time = time.time()
                
                tasks = [fetch_price_async(session, t) for t in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for t, r in zip(batch, results):
                    if not r or isinstance(r, Exception):
                        failed_tickers.add(t)
                
                # 강제 딜레이: BATCH_SIZE(4) 처리에 최소 1.05초 확보 (초당 4건 Limit 준수)
                elapsed = time.time() - start_time
                if elapsed < 1.05:
                    await asyncio.sleep(1.05 - elapsed)
            
            # 재시도 루프 (안전한 리스트 복사본 사용)
            for t in list(failed_tickers):
                success = await fetch_price_async(session, t, attempt=1)
                if success:
                    failed_tickers.remove(t)
                await asyncio.sleep(0.5)
