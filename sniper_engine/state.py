# sniper_engine/state.py
import asyncio

STATE = {
    'baseline': {},
    'vwap': {},
    'rolling_vol': {},
    'virtual_pos': {},
    'last_price': {},
    'cumulative_vol': {},
    'buy_ticks': {},
    'sell_ticks': {},
    'ask_vol_sum': {},
    'bid_vol_sum': {},
    'is_backtest': False,
    'active_tickers': set(),
    'current_time': '--:--:--' # [v9.1.2] 실시간/백테스트 통합 시각 동기화
}

# 🔴 [Red Team 압박 점검] OOM 틱 폭파 방어망
TICK_QUEUE = asyncio.Queue(maxsize=1000)

# 🔴 [Red Team 긴급 핫픽스] Consumer 경쟁 쟁탈전(Race Condition)을 막기 위한 Multi-Queue 분리 체제 (Fan-out)
# Analyzer가 ENTRY 발생 시 두 곳에 동시 투하
TRACKER_QUEUE = asyncio.Queue(maxsize=100)
BROADCAST_QUEUE = asyncio.Queue(maxsize=100)
