# sniper_engine/pipeline/broadcaster.py
import asyncio
import aiohttp
import logging
import os
from redis.asyncio import Redis, from_url
from sniper_engine.state import BROADCAST_QUEUE

logger = logging.getLogger("BroadcasterTask")
logger.setLevel(logging.INFO)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
# MP Stock 메인 서버의 웹훅 수신 엔드포인트 (가정)
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "http://localhost:3000/api/webhook/sniper")

async def broadcaster_task():
    """
    🔵 [Blue Team] 알림 전송 로직 (Task 4.1)
    ALERT_QUEUE 에서 뽑아낸 내부 엔진 시그널을 외부 프론트엔드/Node.js 백엔드로 웹훅 발송을 담당합니다.
    """
    logger.info("Starting Broadcaster Task (Webhook Push Emitter)...")
    
    # 🔴 [Red Team 방어] Redis Timeout 설정하여 블로킹 방지 (백테스트 스피드업)
    redis_pool = from_url(REDIS_URL, decode_responses=True, socket_timeout=0.1)
    
    # 🔴 [Red Team 방어] aiohttp Session 재사용: 포트 고갈 방지 및 커넥션 풀링 이점 활용
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                alert = await BROADCAST_QUEUE.get()
                
                sig_type = alert.get("type")
                ticker = alert.get("ticker", "UNKNOWN")
                
                # 🔵 중복 진입 차단 쿨다운 체크 로직 (ENTRY 인 경우만 적용)
                if sig_type == "ENTRY":
                    cooldown_key = f"cooldown:{ticker}"
                    
                    try:
                        # Redis SETNX(Set if Not Exists): 원자적(Atomic) 연산 보장
                        is_first_alert = await redis_pool.setnx(cooldown_key, "1")
                        
                        if not is_first_alert:
                            logger.warning(f"⏳ [Cooldown Active] {ticker} ENTRY Ignored (within 30 mins).")
                            BROADCAST_QUEUE.task_done()
                            continue
                        
                        # 통과 시 30분(1800초) TTL 부여
                        await redis_pool.expire(cooldown_key, 1800)
                    except Exception as e:
                        logger.error(f"🔴 Redis Cooldown Error (Bypassing filter safely): {e}")
                
                # 웹훅 페이로드 가공 (실제 서버로 Push)
                logger.info(f"🚀 [Broadcast Start] Dispatching Webhook for {sig_type} | {ticker} | {alert.get('signal_id')}")
                
                try:
                    # 🔴 [Red Team 방어] 웹훅 타임아웃 엄수 및 Bearer Token (무결성 해시) 탑재
                    webhook_headers = {
                        "Authorization": f"Bearer {os.environ.get('CORE_INTEGRITY_HASH', '')}",
                        "Content-Type": "application/json"
                    }
                    async with session.post(WEBHOOK_URL, json=alert, headers=webhook_headers, timeout=3.0) as resp:
                        if resp.status not in (200, 201):
                            logger.error(f"🔴 Webhook Rejected by Node.js Server. Status: {resp.status}")
                        else:
                            logger.info(f"✅ Webhook Successfully Delivered: {sig_type} | {ticker}")
                            
                except asyncio.TimeoutError:
                    logger.error(f"🔴 Webhook Timeout (Target Server: {WEBHOOK_URL} is irresponsive. Dropping silently).")
                except Exception as e:
                    logger.error(f"🔴 Webhook Dispatch Failed: {e}")
                
                BROADCAST_QUEUE.task_done()

            except asyncio.CancelledError:
                logger.info("Broadcaster Task Cancelled. Cleaning up queue...")
                break
            except Exception as e:
                logger.error(f"🔴 Broadcaster Critical Exception: {e}")
                await asyncio.sleep(1)

    await redis_pool.aclose()
