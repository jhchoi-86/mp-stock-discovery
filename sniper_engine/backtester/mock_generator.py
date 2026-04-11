# sniper_engine/backtester/mock_generator.py
import json
import random
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MockGenerator")

import os

# 🟢 [Dynamic Tickers Allocation]
# Load from landing_strategy.json to match current Top 5
def get_current_tickers():
    strategy_path = os.path.join(os.path.dirname(__file__), "../../data/landing_strategy.json")
    tickers = {}
    if os.path.exists(strategy_path):
        try:
            with open(strategy_path, 'r', encoding='utf-8') as f:
                strategy = json.load(f)
                for s in strategy.get('stocks', [])[:5]:
                    # [v9.0.7] Use actual currentPrice as base_price to fix uniform 50k bug
                    price = int(s.get('currentPrice', 50000))
                    tickers[s['code']] = {
                        "name": s['name'], 
                        "base_price": price,
                        "initial_price": price # Fix shadow-copy pricing
                    }
            logger.info(f"Loaded {len(tickers)} tickers from landing_strategy.json with REAL prices.")
        except Exception as e:
            logger.error(f"Failed to load strategy: {e}")
            
    if not tickers:
        logger.warning("Using fallback tickers (GS건설, etc.)")
        tickers = {
            "006360": {"name": "GS건설", "base_price": 20000, "initial_price": 20000},
            "375500": {"name": "DL이앤씨", "base_price": 35000, "initial_price": 35000},
            "047040": {"name": "대우건설", "base_price": 4000, "initial_price": 4000},
            "009150": {"name": "삼성전기", "base_price": 140000, "initial_price": 140000},
            "011170": {"name": "롯데케미칼", "base_price": 130000, "initial_price": 130000}
        }
    return tickers

TICKERS = get_current_tickers()

def generate_synthetic_ticks(output_file: str):
    """
    🔵 [Blue Team] 가상의 하루 체결 단위(Tick) 시나리오 제너레이터 (Task 6.4)
    """
    ticks = []
    
    start_time = datetime.strptime("090000", "%H%M%S")
    end_time = datetime.strptime("152000", "%H%M%S")
    current_time = start_time
    
    logger.info("Generating synthetic market flow with dynamic pricing...")
    
    while current_time <= end_time:
        time_str = current_time.strftime("%H%M%S")
        
        # 1. 일상적인 잡음 틱(Noise) 발생
        if random.random() < 0.2:
            code = random.choice(list(TICKERS.keys()))
            info = TICKERS[code]
            
            price_shift = int(info["base_price"] * random.uniform(-0.001, 0.001))
            tick_price = info["base_price"] + price_shift
            vol = random.randint(10, 300)
            is_buy = "5" if random.random() > 0.5 else "1"
            
            ticks.append({
                "code": code,
                "price": str(tick_price),
                "volume": str(vol),
                "is_buy": is_buy,
                "time": time_str
            })
            
        # 🔴 [v9.0.7] 시나리오 보정: 시스템 익절 조건(3.0%)에 도달할 수 있도록 타겟 수익률 상향(5.0%)
        # 또한 종목별로 수급 타이밍을 분산시켜 데이터 중복 현상 원천 차단
        surge_windows = [
            ("102950", "103500", 1.050), # 1차 수급 (5.0%)
            ("130000", "130600", 1.070), # 2차 수급 (누적 7.0%)
            ("141000", "141800", 1.090)  # 3차 수급 (누적 9.0%)
        ]
        
        for start_v, end_v, target_ratio in surge_windows:
            if start_v <= time_str <= end_v:
                for target_code in TICKERS.keys():
                    # 종목 코드의 마지막 자리를 이용해 수급 시작 시간에 약간의 딜레이 부여 (데이터 분산)
                    delay = int(target_code[-1]) * 2 
                    delayed_start = (datetime.strptime(start_v, "%H%M%S") + timedelta(seconds=delay)).strftime("%H%M%S")
                    
                    if time_str < delayed_start:
                        continue

                    # [v9.0.7] initial_price를 기준으로 타겟 가격 산정
                    target_price = int(TICKERS[target_code]["initial_price"] * target_ratio)
                    
                    if random.random() < 0.7: # 수급 유입 확률 상향
                        current_p = TICKERS[target_code]["base_price"]
                        # 목표가 도달 전까지는 가격 상승 유도 (랜덤 보폭 증가)
                        move_p = min(target_price, current_p + random.randint(50, 200))
                        
                        ticks.append({
                            "code": target_code,
                            "price": str(move_p),
                            "volume": str(random.randint(8000, 25000)), # 수급 대금 증강
                            "is_buy": "5",
                            "time": time_str
                        })
                        TICKERS[target_code]["base_price"] = move_p
                        
        # 🟠 돌발 악재 시나리오 (랜덤 1종목 3% 급락) - 14:00
        if "140000" <= time_str <= "140200":
            lucky_ticker = list(TICKERS.keys())[random.randint(0, len(TICKERS)-1)]
            crash_price = int(TICKERS[lucky_ticker]["base_price"] * 0.97)
            if random.random() < 0.5:
                ticks.append({
                    "code": lucky_ticker,
                    "price": str(crash_price),
                    "volume": str(random.randint(5000, 15000)),
                    "is_buy": "1",
                    "time": time_str
                })
                TICKERS[lucky_ticker]["base_price"] = crash_price
                
        current_time += timedelta(seconds=1)
        
    ticks.sort(key=lambda x: x['time'])
    
    save_path = os.path.join(os.path.dirname(__file__), output_file)
    with open(save_path, 'w', encoding='utf-8') as f:
        json.dump(ticks, f)
        
    logger.info(f"✅ Completed. Generated {len(ticks)} synthetic ticks.")
    logger.info(f"💾 File saved successfully: {save_path}")

if __name__ == "__main__":
    generate_synthetic_ticks("synthetic_ticks_0320.json")
