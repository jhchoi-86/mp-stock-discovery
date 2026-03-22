# sniper_engine/backtester/run_backtest.py
import asyncio
import logging
from sniper_engine.backtester.data_loader import TickDataLoader
from sniper_engine.backtester.simulator import BacktestSimulator
from sniper_engine.backtester.metrics import TradeMetrics
from sniper_engine.pipeline.analyzer import analyzer_task
from sniper_engine.pipeline.tracker import tracker_task
from sniper_engine.pipeline.init_task import run_init_task
from sniper_engine.state import TICK_QUEUE, TRACKER_QUEUE, BROADCAST_QUEUE

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("BacktestRunner")

async def main():
    logger.info("Initializing Backtest Sandbox Environment...")
    # 1. 대상 종목 (Mock Generator에서 타겟팅된 6개)
    targets = ["047040", "028050", "161890", "222800", "003030", "298040"]
    await run_init_task(targets)
    
    # 2. 합성 과거 틱 데이터 로드
    loader = TickDataLoader("synthetic_ticks_0320.json")
    ticks = loader.load_data()
    if not ticks:
        logger.error("No tick data found. Aborting.")
        return
        
    # 3. 시뮬레이터(파이프 제어) 인스턴스 생성
    sim = BacktestSimulator(ticks)
    
    # 4. 실서버 엔진 워커 백그라운드 구동 (분석기 & 추적기)
    analyzer_worker = asyncio.create_task(analyzer_task())
    tracker_worker = asyncio.create_task(tracker_task())
    listener_worker = asyncio.create_task(sim.alert_listener())
    
    # 5. '가짜 시간의 방' 강제 주입 시작
    logger.info("🚀 FORWARDING TIME: Injecting synthetic tick streams at lightspeed...")
    await sim.fast_forward_ingestion()
    
    # 처리 랙을 고려해 큐가 빌 때까지 조용히 대기
    await TICK_QUEUE.join()
    # Alert Queue가 빌 때까지도 대기
    await TRACKER_QUEUE.join()
    await BROADCAST_QUEUE.join()
    
    # listener 태스크에 탈출 여유시간 부여
    await asyncio.sleep(2.5) 

    # 6. 태스크 강제 킬(Kill) (실서버 SIGINT 대응과 동일)
    logger.info("Shutting down core engine workers...")
    analyzer_worker.cancel()
    tracker_worker.cancel()
    
    # 7. 🔴 [Red Team 압박 지표] 세금/리스크가 차감된 극한의 메트릭 연산 보고
    logger.info("Calculating Final Conservative Metrics...")
    metrics = TradeMetrics(sim.trade_log)
    metrics.calculate_roi()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
