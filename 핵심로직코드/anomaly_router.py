import logging
import asyncio
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/anomaly-check")
async def check_anomaly(symbol: str = Query(..., description="Stock symbol")):
    """
    T5-04: L5 Approval Anomaly Detection API
    IQR/Z-Score 기반 실시간 파동 이상치(세력 자전거래, 펌프앤덤프 등) 탐지 로직 시뮬레이션
    """
    logger.info(f"[Anomaly] Checking symbol: {symbol}")
    
    # Node.js의 500ms Fail-Open 타임아웃 작동을 증명하기 위한 고의 지연
    if symbol == "TIMEOUT_TEST":
        logger.info(f"[Anomaly] Causing intentional delay for {symbol}")
        await asyncio.sleep(1.0)
        return {"symbol": symbol, "is_anomaly": False}
        
    # Fail-Closed (승인 거부) 작동을 증명하기 위한 고의 이상치 유발
    if symbol == "ANOMALY_TEST":
        logger.warning(f"[Anomaly] 🚨 Spiking behavior detected on {symbol}! (Z-Score > 3.0)")
        return {"symbol": symbol, "is_anomaly": True}
        
    # 정상 케이스
    # DB 쿼리나 인메모리 연산을 거쳐 최대한 50ms 이내에 응답하도록 설계됨.
    return {"symbol": symbol, "is_anomaly": False}
