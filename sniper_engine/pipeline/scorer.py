# sniper_engine/pipeline/scorer.py
import logging

logger = logging.getLogger("ScoringEngine")
logger.setLevel(logging.INFO)

class ScoringEngine:
    """
    🔵 [Blue Team] 5가지 핵심 지표 Scoring Engine 모듈
    본 로직은 Analyzer와 분리되어 독립적으로 동작하며, TDR(Trading Data River) 승인을 위한
    점수를 계산하고 등급(S, A, B, C)을 산정합니다.
    """
    
    @staticmethod
    def compute_indicators(data: dict) -> dict:
        """
        1차 지표 (Raw Indicators) 계산
        """
        open_p = float(data.get("open", 0))
        # 🔴 [Red Team 방어 1] Zero Division 에러 원천 차단 (Fallback)
        prev_close = float(data.get("prev_close") or 1)
        current_vol = float(data.get("current_vol", 0))
        avg_5d_vol = float(data.get("avg_prev_5d_vol") or 1)
        current_price = float(data.get("current_price", 0))
        vwap = float(data.get("vwap") or 1)
        buy_ticks = float(data.get("buy_ticks", 0))
        sell_ticks = float(data.get("sell_ticks") or 1)
        ask_vol_sum = float(data.get("ask_volume_sum", 0))
        bid_vol_sum = float(data.get("bid_volume_sum") or 1)

        # 지표 산정식
        gap = ((open_p - prev_close) / prev_close) * 100
        vol_surge = (current_vol / avg_5d_vol) * 100
        vwap_div = (current_price / vwap) * 100
        tick_power = (buy_ticks / sell_ticks) * 100
        ob_ratio = (ask_vol_sum / bid_vol_sum) * 100

        return {
            "gap": gap,
            "vol_surge": vol_surge,
            "vwap_div": vwap_div,
            "tick_power": tick_power,
            "ob_ratio": ob_ratio
        }

    @staticmethod
    def calculate_score(indicators: dict) -> dict:
        """
        명세된 임계치(Threshold)에 따른 배점표 적용
        """
        scores = {}
        gap = indicators["gap"]
        vol_surge = indicators["vol_surge"]
        vwap_div = indicators["vwap_div"]
        tick_power = indicators["tick_power"]
        ob_ratio = indicators["ob_ratio"]

        # 1. 갭상승률 점수 (-100 ~ 100점)
        if gap >= 15: scores["gap"] = -100 # 갭이 너무 뜨면 위험
        elif 5 <= gap < 15: scores["gap"] = 100
        elif 1.0 <= gap < 5: scores["gap"] = 50
        else: scores["gap"] = 0

        # 2. 거래대금 급증률 (0 ~ 100점)
        if vol_surge >= 300: scores["vol_surge"] = 100
        elif 200 <= vol_surge < 300: scores["vol_surge"] = 70
        elif 100 <= vol_surge < 200: scores["vol_surge"] = 50
        else: scores["vol_surge"] = 0

        # 3. VWAP 이격도 (-100 ~ 100점)
        if vwap_div >= 101.5: scores["vwap_div"] = 0  # 지나치게 높은 이격은 상승 탄력 둔화
        elif 100.1 <= vwap_div < 101.5: scores["vwap_div"] = 100
        # 🔴 [Red Team 방어 2] 설계 문서의 사각지대 (100.0 ~ 100.1) 누수 커버
        elif 100.0 <= vwap_div < 100.1: scores["vwap_div"] = 50 
        elif 99.0 <= vwap_div < 100.0: scores["vwap_div"] = 50
        else: scores["vwap_div"] = -100 # VWAP 아래로 완전히 꺾이면 페널티 

        # 4. 체결강도 (0 ~ 100점)
        if tick_power >= 150: scores["tick_power"] = 100
        elif 100 <= tick_power < 150: scores["tick_power"] = 50
        else: scores["tick_power"] = 0

        # 5. 호가 잔량 매물대 비율 (Ask/Bid OB Ratio) (0 ~ 100점)
        if ob_ratio >= 150: scores["ob_ratio"] = 100
        elif 100 <= ob_ratio < 150: scores["ob_ratio"] = 50
        else: scores["ob_ratio"] = 0

        # 총점 연산
        total_raw = sum(scores.values())
        
        # 🔴 [Red Team 방어 3] 페널티로 인한 총점 음수 붕괴 하한선 캡 적용
        total_safe = max(0, total_raw)

        return {
            "breakdown": scores,
            "total_score": total_safe
        }

    @staticmethod
    def get_grade(total_score: int) -> str:
        """
        최고점 500점 기준 등급 결정
        """
        if total_score >= 400: return 'S' # A급 이상 급등 확인 
        if total_score >= 300: return 'A' # 준수한 스윙/단타 대상
        if total_score >= 200: return 'B' # 추적 관찰 대상
        return 'C' # 폐기 대상
