# sniper_engine/pipeline/ingestion.py
import asyncio
import json
import logging
import websockets
from sniper_engine.state import TICK_QUEUE

logger = logging.getLogger("IngestionTask")
logger.setLevel(logging.INFO)

async def ws_ingestion_task(targets, mock_url="ws://localhost:8765"):
    """
    🔵 [Blue Team] 실시간 틱 수신부 (Task 2.2)
    - KIS웹소켓 데이터 수신 및 파싱하여 즉시 TICK_QUEUE 무한 스트리밍 적재
    """
    while True:
        try:
            logger.info("Connecting to WebSocket Engine...")
            # 🔴 [Red Team 방어] ping_interval, ping_timeout 명시. 서버가 끊겼는데도 닫힘 이벤트를 발송하지 않는 좀비 소켓 원천 차단.
            async with websockets.connect(mock_url, ping_interval=20, ping_timeout=10) as ws:
                logger.info("Connected. Subscribing to fast data stream...")
                
                # 가상 구독 요청
                sub_req = {"header": {"tr_type": "1"}, "body": {"input": {"tr_id": "H0STCNT0"} } }
                await ws.send(json.dumps(sub_req))
                
                while True:
                    # 🔴 [Red Team 방어] 10초간 아무 틱도 들어오지 않으면 타임아웃을 강제로 내어 끊김으로 단정! (Silent Drop 돌파)
                    try:
                        message = await asyncio.wait_for(ws.recv(), timeout=10.0)
                        data = json.loads(message)
                        
                        if data.get("header", {}).get("tr_id") == "H0STCNT0":
                            tick = data.get("body", {})
                            if not tick: continue
                            
                            try:
                                # 🔵 [Blue Team] 즉각 논블로킹 큐삽입
                                TICK_QUEUE.put_nowait(tick)
                            except asyncio.QueueFull:
                                # 🔴 [Red Team 방어] 큐가 터질 시 가장 오래된 것('get_nowait()') 쓰레기통에 바로 버리고 최신 틱 우선 적재 보장
                                TICK_QUEUE.get_nowait()
                                TICK_QUEUE.put_nowait(tick)
                                logger.warning("TICK_QUEUE FULL! Discarded oldest tick for fast-forwarding.")

                    except asyncio.TimeoutError:
                        logger.error("🔴 [Red Team] WebSocket 10-sec Timeout! Force resetting network loop.")
                        break # 안쪽 루프 탈출 후 바깥쪽 While True 에서 즉시 재연결 수행
                        
        except websockets.exceptions.ConnectionClosed as e:
            logger.error(f"WebSocket Connection Closed: {e}. Reconnecting in 3s...")
            await asyncio.sleep(3)
        except Exception as e:
            logger.critical(f"Critical Ingestion Error: {e}. Reconnecting in 3s...")
            await asyncio.sleep(3)
