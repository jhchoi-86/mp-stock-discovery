# sniper_engine/utils/time_utils.py

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
