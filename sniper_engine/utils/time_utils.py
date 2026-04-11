import json
import os
from datetime import datetime, timezone, timedelta

def get_market_hours_config():
    """공통 market_hours.json 로드"""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    config_path = os.path.join(base_dir, "platform", "markets", "kr_equity", "market_hours.json")
    try:
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)["kr_equity"]
    except Exception as e:
        print(f"[MarketHours] Failed to load config: {e}")
    
    # Fallback default values
    return {
        "trading_hours": {"start": "08:00", "end": "20:00"},
        "holidays": {}
    }

def is_trading_day():
    """주말 및 공휴일 체크 (KST 기준)"""
    now = datetime.now(timezone(timedelta(hours=9))) # KST
    if now.weekday() >= 5: return False # 토(5)/일(6) 제외
    
    year = str(now.year)
    config = get_market_hours_config()
    holidays = config.get("holidays", {}).get(year, [])
    date_str = now.strftime("%Y-%m-%d")
    
    return date_str not in holidays

def is_market_open():
    """장 운영 시간 체크 (KST 기준)"""
    if not is_trading_day(): return False
    
    now = datetime.now(timezone(timedelta(hours=9))) # KST
    config = get_market_hours_config()
    hours = config.get("trading_hours", {})
    
    try:
        start_h, start_m = map(int, hours.get("start", "08:00").split(':'))
        end_h, end_m = map(int, hours.get("end", "20:00").split(':'))
        
        current_val = now.hour * 100 + now.minute
        start_val = start_h * 100 + start_m
        end_val = end_h * 100 + end_m
        
        return start_val <= current_val <= end_val
    except:
        return False

def hms_to_window_index(hms_str: str, window_seconds: int = 10) -> int:
    """
    🔵 [Blue Team] 초경량 KST 시간 처리 유틸리티
    datetime 모듈의 무거운 파싱 오버헤드를 줄이기 위해, KIS에서 수신하는 
    "HHMMSS" 포맷의 6자리 문자열을 받아 당일 0초부터 지나간 초(second)를
    계산한 후, window_seconds 로 나누어 버킷 인덱스를 반환합니다.

    🔴 [Red Team 방어]
    - 예외 처리 (가비지 데이터 입력 시 0 반환 혹은 패스)
    - 속도를 극한으로 끌어올리기 위한 단순 슬라이싱/형변환 로직
    """
    if not hms_str or len(hms_str) != 6:
        # Fallback for garbage or malformed strings
        return 0
    
    try:
        h = int(hms_str[0:2])
        m = int(hms_str[2:4])
        s = int(hms_str[4:6])
        
        total_seconds = (h * 3600) + (m * 60) + s
        return total_seconds // window_seconds
        
    except ValueError:
        # 숫자가 아닌 문자가 포함된 극단적 에지 케이스 방어
        return 0
