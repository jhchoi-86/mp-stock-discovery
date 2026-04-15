# sniper_engine/core/auth_manager.py
import os
import aiohttp
import logging
from redis.asyncio import Redis, from_url
from dotenv import load_dotenv

load_dotenv()

KIS_APP_KEY = os.environ.get("KIS_APP_KEY", "")
KIS_APP_SECRET = os.environ.get("KIS_APP_SECRET", "")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

logger = logging.getLogger("AuthManager")
logger.setLevel(logging.INFO)

class KISAuthManager:
    """
    🔵 [Blue Team] KIS Auth Manager (인증 관리자)
    웹소켓 승인키(Approval Key)를 aiohttp로 발급받고,
    redis.asyncio에 TTL(24시간)과 함께 저장하여 API 호출 비용 및 한도 소진을 막습니다.
    """
    def __init__(self):
        # 🔴 [Red Team 방어]: Redis Timeout 설정 추가하여 행업(Hang-up) 방지. decode_responses로 형변환 비용 최적화.
        self.redis_pool: Redis = from_url(REDIS_URL, decode_responses=True, socket_timeout=3.0)
        self.approval_url = "https://openapi.koreainvestment.com:9443/oauth2/Approval"
        
    async def get_websocket_approval_key(self) -> str:
        # Step 1: Redis 캐시 확인 (장애 시 폴백)
        try:
            cached_key = await self.redis_pool.get("kis:approval_key")
            if cached_key:
                logger.info("[KIS-PY] approval_key Redis 캐시 사용")
                return cached_key
        except Exception as e:
            logger.warning(f"[KIS-PY] Redis 조회 실패, 직접 발급으로 폴백: {e}")

        # Step 2: KIS API 신규 발급
        payload = {
            "grant_type": "client_credentials",
            "appkey": KIS_APP_KEY,
            "secretkey": KIS_APP_SECRET
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(self.approval_url, json=payload, timeout=5.0) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        logger.error(f"Approval Target API Error: {resp.status} - {text}")
                        raise Exception(f"Failed to get approval key: Status {resp.status}")
                    
                    data = await resp.json()
                    approval_key = data.get("approval_key")
                    
                    if not approval_key:
                        raise ValueError("No approval_key in KIS JSON response")
                    
                    # Step 3: TTL은 KIS 응답값(expires_in) 우선, 없으면 6시간(21600)
                    ttl = data.get("expires_in", 21600)
                    
                    # Step 4: SET NX — Race Condition 방지 (SET with nx=True)
                    try:
                        await self.redis_pool.set("kis:approval_key", approval_key, ex=ttl, nx=True)
                        logger.info(f"[KIS-PY] approval_key 신규 발급 → Redis 저장 (TTL: {ttl}s)")
                    except Exception as e:
                        logger.warning(f"[KIS-PY] Redis 저장 실패 (무시): {e}")

                    return approval_key

            except asyncio.TimeoutError:
                logger.error("KIS API Approval Request timed out.")
                raise
            except aiohttp.ClientError as e:
                logger.error(f"aiohttp ClientError: {e}")
                raise

    async def close(self):
        await self.redis_pool.aclose()
        logger.info("Redis Connection Pool Closed safely.")
