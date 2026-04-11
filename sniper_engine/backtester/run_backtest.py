# sniper_engine/backtester/run_backtest.py
import asyncio
import logging
import argparse
import sys
import json

# 🔴 [Red Team Early Suppression] v4.8.1
# Ensure NO logging noise corrupts stdout when JSON is requested
if "--json" in sys.argv:
    logging.disable(logging.CRITICAL)

from sniper_engine.backtester.data_loader import TickDataLoader
from sniper_engine.backtester.simulator import BacktestSimulator
from sniper_engine.backtester.metrics import TradeMetrics
from sniper_engine.pipeline.analyzer import analyzer_task
from sniper_engine.pipeline.tracker import tracker_task
from sniper_engine.pipeline.init_task import run_init_task
from sniper_engine.state import STATE, TICK_QUEUE, TRACKER_QUEUE, BROADCAST_QUEUE

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("BacktestRunner")

async def main(json_output=False, stocks=None):
    STATE['is_backtest'] = True
    
    if not json_output:
        logger.info("Initializing Backtest Sandbox Environment...")
    
    # Target stocks (Dynamic from SSOT/Landing)
    targets = stocks if stocks else ["047040", "028050", "161890", "222800", "003030", "298040"]
    await run_init_task(targets)
    
    # 2. Historical tick data
    import os
    data_path = os.path.join(os.path.dirname(__file__), "synthetic_ticks_0320.json")
    loader = TickDataLoader(data_path)
    ticks = loader.load_data()
    if not ticks:
        if json_output:
            print(json.dumps({"error": "No tick data found", "file": "synthetic_ticks_0320.json"}))
        else:
            logger.error("No tick data found. Aborting.")
        return
        
    sim = BacktestSimulator(ticks)
    
    # 4. Engine Workers
    analyzer_worker = asyncio.create_task(analyzer_task())
    tracker_worker = asyncio.create_task(tracker_task())
    listener_worker = asyncio.create_task(sim.alert_listener())
    
    # 5. Injection
    if not json_output:
        logger.info("🚀 FORWARDING TIME: Injecting synthetic tick streams...")
    await sim.fast_forward_ingestion()
    
    try:
        await asyncio.wait_for(TICK_QUEUE.join(), timeout=30.0)
        await asyncio.wait_for(TRACKER_QUEUE.join(), timeout=10.0)
        await asyncio.wait_for(BROADCAST_QUEUE.join(), timeout=10.0)
    except asyncio.TimeoutError:
        if not json_output:
            logger.warning("Queue join timed out.")
    
    await asyncio.sleep(1.0) 

    analyzer_worker.cancel()
    tracker_worker.cancel()
    
    if not json_output:
        logger.info("Calculating Final Metrics...")
    
    metrics = TradeMetrics(sim.trade_log)
    results = metrics.calculate_roi()
    
    if json_output:
        # 🔴 [CRITICAL] Standard Out ONLY contains JSON with trade_log
        print(json.dumps(results))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output only JSON results")
    parser.add_argument("stocks", nargs="*", help="Stock codes to simulate")
    args = parser.parse_args()
    
    try:
        # 🟢 [Dynamic Target Allocation]
        # Use stocks from CLI if provided, otherwise fallback to defaults
        targets = args.stocks if args.stocks else ["047040", "028050", "161890", "222800", "003030", "298040"]
        asyncio.run(main(json_output=args.json, stocks=targets))
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
