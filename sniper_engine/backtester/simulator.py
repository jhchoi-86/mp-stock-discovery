# sniper_engine/backtester/simulator.py
import asyncio
import logging
from sniper_engine.state import STATE, TICK_QUEUE, BROADCAST_QUEUE

logger = logging.getLogger("Simulator")
logger.setLevel(logging.INFO)

class BacktestSimulator:
    """
    🔵 [Blue Team] 백테스트 시뮬레이터 워커 (Task 6.2)
    실시간 웹소켓을 연결하는 대신 `data_loader.py` 가 가져온 과거의 Tick 데이터를
    실제 시스템의 TICK_QUEUE 와 동일하게 쏴주는 파이프라인.
    (실서버 analyzer / tracker 코드를 단 한 줄도 손대지 않고 재사용할 수 있습니다.)
    """
    def __init__(self, tick_data: list):
        self.tick_data = tick_data
        self.trade_log = []
        
    async def fast_forward_ingestion(self):
        """과거 데이터를 최고 속도(논블로킹)로 엔진 큐에 때려 붓습니다."""
        cum_volume = {}
        cum_amount = {}
        
        for tick in self.tick_data:
            ticker = tick.get("code")
            price = int(tick.get("price", 0))
            vol = int(tick.get("volume", 0))
            
            if ticker not in cum_volume:
                cum_volume[ticker] = 0
                cum_amount[ticker] = 0
                
            cum_volume[ticker] += vol
            cum_amount[ticker] += (price * vol)
            
            # 🔴 [Red Team 지적] Anti-Drift (10분 주기 API 동기화) 로직의 구멍 차단!
            # 과거 장 마감 후의 '최종 VWAP'을 미리 알아서 스니핑하는 사기(Cheat)를 막기 위해,
            # 틱이 인입될 때마다 그 틱 기준 시간대의 누적(Cumulative) 데이터를 통해 '장중 틱 단위 실시간 VWAP'을 직접 연산/교정합니다.
            if cum_volume[ticker] > 0:
                STATE['vwap'][ticker] = float(cum_amount[ticker]) / cum_volume[ticker]

            # [v9.1.2] 시뮬레이션 시각 동기화 (analyzer/tracker가 이를 참조)
            tick_time = tick.get("time")
            if tick_time:
                STATE['current_time'] = tick_time

            # 큐 무한 폭주를 막기 위해 maxsize 제한을 존중하며 적재 (Full 시 잠시 대기 Asyncio 블로킹)
            await TICK_QUEUE.put(tick)
            
        logger.info("🏁 [Simulator] All historical ticks have been injected natively.")
        
    async def alert_listener(self):
        """Broadcaster Task를 대체하여 ENTRY/EXIT 신호를 가로채서 백테스트 로그에 박제합니다."""
        while True:
            try:
                # 레드팀 방어: 무한 루프 갇힘 방지 (큐 텅 빔 감지 시간을 5초로 확장하여 엔진 처리 지연 대응)
                alert = await asyncio.wait_for(BROADCAST_QUEUE.get(), timeout=5.0)
                self.trade_log.append(alert)
                
                sig_type = alert.get("type", "UNKNOWN")
                price = alert.get("price", 0)
                
                logger.info(f"💡 [Backtest Catch] {sig_type} | {alert.get('ticker')} | Trigger Price: {price}")
                BROADCAST_QUEUE.task_done()
                
            except asyncio.TimeoutError:
                # 틱 주입 Task가 끝난 뒤, 더 이상 알럿이 없으면 조용히 종료 (Teardown)
                if TICK_QUEUE.empty():
                    logger.info("📭 [Simulator] No more alerts in queue. Exiting trace listener.")
                    break
