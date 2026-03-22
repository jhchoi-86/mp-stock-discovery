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
        try:
            # 1. Redis 캐시 확인 (1ms 이내 반환)
            cached_key = await self.redis_pool.get("kis:approval_key")
            if cached_key:
                return cached_key
        except Exception as e:
            logger.error(f"Redis Cache Error: {e}")
            # 캐시 에러가 발생하더라도 서비스 장애를 유발하지 않고 API 호출로 우회(Fallback)

        # 2. 캐시 없으면 REST API 호출
        payload = {
            "grant_type": "client_credentials",
            "appkey": KIS_APP_KEY,
            "secretkey": KIS_APP_SECRET
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                # 🔴 [Red Team 방어]: API 호출 5초 Timeout 강제. (서버 응답 지연으로 루프 전체 멈춤 현상 원천 봉쇄)
                async with session.post(self.approval_url, json=payload, timeout=5.0) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        logger.error(f"Approval Target API Error: {resp.status} - {text}")
                        raise Exception(f"Failed to get approval key: Status {resp.status}")
                    
                    data = await resp.json()
                    approval_key = data.get("approval_key")
                    
                    if not approval_key:
                        raise ValueError("No approval_key in KIS JSON response")
                    
                    # 3. Redis 저장 및 24시간 TTL 세팅 (보수적으로 86000초 = 23.8시간)
                    try:
                        await self.redis_pool.setex("kis:approval_key", 86000, approval_key)
                        logger.info("Approval Key cached to Redis safely.")
                    except Exception as e:
                        logger.warning(f"Failed to cache to Redis (ignoring): {e}")

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
