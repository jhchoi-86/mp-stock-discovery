import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sniper_engine.utils.time_utils import is_market_open, is_trading_day
from datetime import datetime, timezone, timedelta

print("--- Python Market Hours Verification ---")
print(f"Current KST: {datetime.now(timezone(timedelta(hours=9)))}")
print(f"Is Trading Day? {is_trading_day()}")
print(f"Is Market Open? {is_market_open()}")

print("SUCCESS: Python Market Hours loaded correctly.")
