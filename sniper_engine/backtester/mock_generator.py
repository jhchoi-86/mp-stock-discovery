# sniper_engine/backtester/mock_generator.py
import json
import random
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MockGenerator")

# PM님이 지정해주신 3월 20일 추천 종목 6개 및 임의의 장식용 베이스 단가
TICKERS = {
    "047040": {"name": "대우건설", "base_price": 4000},
    "028050": {"name": "삼성E&A", "base_price": 25000},
    "161890": {"name": "한국콜마", "base_price": 45000},
    "222800": {"name": "심텍", "base_price": 30000},
    "003030": {"name": "세아제강지주", "base_price": 150000},
    "298040": {"name": "효성중공업", "base_price": 250000}
}

def generate_synthetic_ticks(output_file: str):
    """
    🔵 [Blue Team] 가상의 하루 체결 단위(Tick) 시나리오 제너레이터 (Task 6.4)
    - 실데이터가 없을 때 로직이 정상 동작하는지 테스트하기 위해 '합성 데이터(Synthetic Data)'를 만듭니다.
    - 특징: 특정 시간대에 특정 종목에 엄청난 수급을 몰아넣어(Fake Surge) 스나이퍼 엔진이 제대로 트리거하는지 관찰합니다.
    """
    ticks = []
    
    # 09:00:00 부터 15:20:00 까지 흐르는 가상의 시간 루프
    start_time = datetime.strptime("090000", "%H%M%S")
    end_time = datetime.strptime("152000", "%H%M%S")
    current_time = start_time
    
    logger.info("Generating synthetic market flow from 09:00 to 15:20...")
    
    while current_time <= end_time:
        time_str = current_time.strftime("%H%M%S")
        
        # 1. 일상적인 잡음 틱(Noise) 발생 (모든 종목에 띄엄띄엄 거래 발생)
        if random.random() < 0.2:  # 매초마다 20% 확률로 틱 하나 체결
            code = random.choice(list(TICKERS.keys()))
            info = TICKERS[code]
            
            # 0.1% 내외의 랜덤 가격 변동
            price_shift = int(info["base_price"] * random.uniform(-0.001, 0.001))
            tick_price = info["base_price"] + price_shift
            vol = random.randint(10, 300)
            is_buy = "5" if random.random() > 0.5 else "1" # 5=매수체결, 1=매도체결
            
            ticks.append({
                "code": code,
                "price": str(tick_price),
                "volume": str(vol),
                "is_buy": is_buy,
                "time": time_str
            })
            
        # 2. 🔴 [Red Team 강제 돌파 시나리오] 10시 30분, 삼성E&A(028050)에 작전 세력(?) 개입 연출!
        # - 순매수 금액 3,000만 원 이상 & 거래량 폭증 (WBS Analyzer 발동 조건 충족)
        if "102950" <= time_str <= "103010":
            target_code = "028050"
            # 현재가를 갑자기 200원 위로 치고 올라가는 시장가 매수 연속 체결
            surge_price = TICKERS[target_code]["base_price"] + 200 
            
            if random.random() < 0.8: # 매우 잦은 빈도의 폭격!
                ticks.append({
                    "code": target_code,
                    "price": str(surge_price),
                    "volume": str(random.randint(3000, 6000)), # 큰 볼륨으로 밀어붙임
                    "is_buy": "5",  # 100% 매수 체결(누군가 매도 호가를 강하게 먹음)
                    "time": time_str
                })
                # 기본 단가를 멱살잡고 올려놓음
                TICKERS[target_code]["base_price"] = surge_price
                
        # 3. 🔴 [Red Team 청산 시나리오] 14:00 이후 심텍(222800) 가격 붕괴 연출 (손절 로직 테스트용)
        if "140000" <= time_str <= "140500":
            simtech = "222800"
            crash_price = TICKERS[simtech]["base_price"] - 500
            if random.random() < 0.5:
                ticks.append({
                    "code": simtech,
                    "price": str(crash_price),
                    "volume": str(random.randint(1000, 2000)),
                    "is_buy": "1", # 매도 물량 폭탄
                    "time": time_str
                })
                TICKERS[simtech]["base_price"] = crash_price
                
        current_time += timedelta(seconds=1)
        
    # 미래참조 꼬임 방지를 위해 완벽히 시간순(Time) 정렬
    ticks.sort(key=lambda x: x['time'])
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(ticks, f)
        
    logger.info(f"✅ Completed. Generated {len(ticks)} synthetic ticks.")
    logger.info(f"💾 File saved successfully: {output_file}")

if __name__ == "__main__":
    generate_synthetic_ticks("synthetic_ticks_0320.json")
