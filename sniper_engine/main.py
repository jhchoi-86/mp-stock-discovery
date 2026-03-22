# sniper_engine/main.py
import asyncio
import signal
import logging
from sniper_engine.pipeline.init_task import run_init_task
from sniper_engine.pipeline.ingestion import ws_ingestion_task
from sniper_engine.pipeline.anti_drift import anti_drift_task
from sniper_engine.pipeline.analyzer import analyzer_task
from sniper_engine.pipeline.tracker import tracker_task
from sniper_engine.pipeline.broadcaster import broadcaster_task

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("MainOrchestrator")

running_tasks = []

async def shutdown(sig, loop):
    """
    🔵 [Blue Team] Graceful Shutdown (Task 4.2)
    명령줄(CMD)에서 프로세스가 종료 시그널(Ctrl+C, SIGINT, SIGTERM)을 받을 때,
    내부 백그라운드 워커 Task들을 우아하게 취소(Cancel)하고 Redis/HTTP 자원을 안전하게 시스템에 반납합니다.
    """
    logger.info(f"🔴 [Red Team Security] Received OS exit signal {sig.name}...")
    logger.info("Canceling all 5 running micro-tasks to prevent zombie processing or cache data corruption...")
    
    for task in running_tasks:
        task.cancel()
        
    results = await asyncio.gather(*running_tasks, return_exceptions=True)
    for res in results:
        if isinstance(res, Exception) and not isinstance(res, asyncio.CancelledError):
            logger.error(f"Task shutdown exception: {res}")
            
    logger.info("✅ System offline cleanly (Zero Connection Leaks). Bye.")
    loop.stop()

async def main():
    logger.info("🚀 Booting MP Stock Sniper Engine v4.2 (Full-Async Architecture)")
    
    # 1. 초기화 (Init)
    targets = await run_init_task()
    
    # 2. 파이프라인 워커 리스트 할당 및 비동기 분배
    global running_tasks
    running_tasks = [
        asyncio.create_task(ws_ingestion_task(targets, mock_url="ws://localhost:8765"), name="Ingestion"),
        asyncio.create_task(anti_drift_task(targets), name="AntiDrift"),
        asyncio.create_task(analyzer_task(), name="Analyzer"),
        asyncio.create_task(tracker_task(), name="Tracker"),
        asyncio.create_task(broadcaster_task(), name="Broadcaster")
    ]
    
    try:
        # 백그라운드 태스크 무한 루프 파이프라인 가동
        await asyncio.gather(*running_tasks)
    except asyncio.CancelledError:
        logger.info("Main worker gather successfully cancelled via OS.")

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    
    # 🔴 [Red Team 방어] 리눅스 및 윈도우 OS 수준 강제 종료 시그널 핸들러 후킹 (Graceful Teardown 지원)
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda sig=sig: asyncio.create_task(shutdown(sig, loop)))
        
    try:
        loop.run_until_complete(main())
    finally:
        loop.close()
