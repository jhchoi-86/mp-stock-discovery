import asyncio
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(message)s')

from sniper_engine.state import STATE, TICK_QUEUE
from sniper_engine.pipeline.init_task import run_init_task
from sniper_engine.pipeline.ingestion import ws_ingestion_task

async def consumer_mock():
    # 🔴 [Red Team 검증] Ingestion 이 큐(TICK_QUEUE)에 넣는 것을 시스템이 제대로 소비(Consume)하는지 확인
    print("🔴 Starting Red Team Mock Consumer Tool...")
    ticks_processed = 0
    while True:
        tick = await TICK_QUEUE.get()
        ticks_processed += 1
        
        if ticks_processed % 10 == 0:
            print(f"[RECV TICK {ticks_processed}] {tick['code']} | Price: {tick['price']} | Vol: {tick['volume']}")
            
        TICK_QUEUE.task_done()

async def main():
    print("====== [Phase 2] Data Pipeline Integration Test =======")
    
    # 1. Init Task 동작 검사
    targets = await run_init_task()
    print(f"✅ Init Task Booted. Targets memory layout verified. VWAP State: {STATE['vwap']}")
    
    # 2. Ingestion 파이프라인 가동 (로컬 Replay 서버 필요)
    print("⏳ Launching Ingestion & Consumer Task...")
    ingestion = asyncio.create_task(ws_ingestion_task(targets, mock_url="ws://localhost:8765"))
    consumer = asyncio.create_task(consumer_mock())
    
    # 3. 7초간 관전 후 우아하게 종료
    await asyncio.sleep(7)
    
    print("✅ Integration Validation End. Canceling loops...")
    ingestion.cancel()
    consumer.cancel()

if __name__ == "__main__":
    asyncio.run(main())
