# sniper_engine/pipeline/anti_drift.py
import asyncio
import aiohttp
import logging
from sniper_engine.state import STATE

logger = logging.getLogger("AntiDrift")
logger.setLevel(logging.INFO)

async def anti_drift_task(targets):
    """
    🔵 [Blue Team] VWAP 강제 동기화 크론잡 (Task 2.3)
    10분(600초)마다 KIS 현재가 REST API를 지속 패치하여 메모리 VWAP 파편화 교정 (Drift 리셋).
    """
    while True:
        await asyncio.sleep(600)  # 10분 강제 Sleep 루프
        
        logger.info("Executing Anti-Drift VWAP Sync...")
        
        async with aiohttp.ClientSession() as session:
            for target in targets:
                # 🔴 [Red Team 방어 1] KIS API Rate Limiter: 초당 4건 제한을 넘지 않도록 안전빵으로 종목당 1초 쉬면서 연동
                await asyncio.sleep(1.0)
                
                url = f"https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_INPUT={target}"
                
                try:
                    # 🔴 [Red Team 방어 2] 5초 타임아웃 강제. 무한 Pending 빠짐 차단.
                    async with session.get(url, timeout=5.0) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            # 🔵 [Blue Team] VWAP 강제 주입
                            vwap_val = float(data.get("output", {}).get("stck_prpr", "0"))
                            if vwap_val > 0:
                                STATE['vwap'][target] = vwap_val
                                logger.debug(f"{target} VWAP synced effectively.")
                                
                        elif resp.status == 429:
                            logger.error("🔴 [Red Team] HTTP 429 Too Many Requests! Firing Backoff.")
                            await asyncio.sleep(5)  # Exponential Backoff 모방
                        else:
                            logger.warning(f"AntiDrift API Reject Status {resp.status}")
                            
                except Exception as e:
                    logger.error(f"AntiDrift Crash Blocked for {target}: {e}")
