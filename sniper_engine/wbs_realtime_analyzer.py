import asyncio
import time
import logging
from datetime import datetime
from collections import deque, defaultdict
import sys

# Windows 환경 호환성 처리 (Task 2-1)
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
else:
    try:
        import uvloop
        asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
    except ImportError:
        pass

logger = logging.getLogger("WBSAnalyzer")

class WBSAggregator:
    """[Task 2-1] 1초 배치 집계 및 롤링 WBS 엔진"""
    def __init__(self, tickers):
        self.tickers = tickers
        # 1초 배치용 임시 저장소 {ticker: {"buy_vol": 0, "total_vol": 0}}
        self.batch_data = defaultdict(lambda: {"buy_vol": 0, "total_vol": 0})
        # 1분(60초) 롤링 데이터 {ticker: deque([1s_data, ...], maxlen=60)}
        self.rolling_1m = defaultdict(lambda: deque(maxlen=60))
        # 1분봉 WBS 기록 {ticker: deque(maxlen=3)} -> Task 2-1의 3분봉 가중치용
        self.wbs_history = defaultdict(lambda: deque(maxlen=3))

    def add_tick(self, ticker, price, volume, is_buy):
        """실시간 틱 데이터 유입 (RealtimeEngine에서 호출)"""
        self.batch_data[ticker]["total_vol"] += volume
        if is_buy:
            self.batch_data[ticker]["buy_vol"] += volume

    async def run_batch_loop(self, callback):
        """1초 단위 배치 처리 루프"""
        while True:
            await asyncio.sleep(1) # 1초 대기
            current_batch = self.batch_data.copy()
            self.batch_data.clear() # 다음 배치를 위해 비움

            for ticker in self.tickers:
                data = current_batch.get(ticker, {"buy_vol": 0, "total_vol": 0})
                self.rolling_1m[ticker].append(data)
                
                # 1분 WBS 계산
                total_1m = sum(d["total_vol"] for d in self.rolling_1m[ticker])
                buy_1m = sum(d["buy_vol"] for d in self.rolling_1m[ticker])
                
                wbs_1m = (buy_1m / total_1m * 100) if total_1m > 0 else 0
                self.wbs_history[ticker].append(wbs_1m)

                # 3분 가중 평균 WBS (Task 2-1: 최신 봉 가중치 2배)
                # history [W1, W2, W3] -> (W1 + W2 + W3*2) / 4
                hist = list(self.wbs_history[ticker])
                if len(hist) == 3:
                    wbs_3m = (hist[0] + hist[1] + hist[2] * 2) / 4
                elif len(hist) > 0:
                    wbs_3m = sum(hist) / len(hist)
                else:
                    wbs_3m = 0
                
                # 분석 결과 콜백 (SignalGate로 전달)
                if callback:
                    await callback(ticker, wbs_1m, wbs_3m)

class SignalGate:
    """[Task 2-2] 수급 돌파 조건 및 오신호 필터"""
    def __init__(self, config=None):
        self.config = config or {} # 종목별 임계값 등
        self.tick_counters = defaultdict(int) # [R-10] 3틱 카운터
        self.cooldowns = {} # {ticker: expiry_time}

    async def check_signal(self, ticker, wbs_1m, wbs_3m, order_book, current_price):
        """시그널 발생 조건 체크"""
        threshold = self.config.get(ticker, {}).get("threshold", 65)
        
        # ① 1분 WBS ≥ 임계값
        cond1 = wbs_1m >= threshold
        # ② 3분 WBS ≥ 임계값 × 0.85
        cond2 = wbs_3m >= (threshold * 0.85)
        # ③ 호가 압박 (매도잔량 < 매수잔량 × 0.7)
        ask_res = order_book.get("ask1_res", 1)
        bid_res = order_book.get("bid1_res", 0)
        cond3 = ask_res < (bid_res * 0.7)

        if cond1 and cond2 and cond3:
            self.tick_counters[ticker] += 1
        else:
            self.tick_counters[ticker] = 0

        # ④ 3틱 연속 충족 (R-10)
        if self.tick_counters[ticker] >= 3:
            now = time.time()
            if ticker in self.cooldowns and now < self.cooldowns[ticker]:
                return None
            
            self.cooldowns[ticker] = now + 300 # 5분 쿨다운
            self.tick_counters[ticker] = 0 # 신호 확정 후 리셋
            
            # P-Score 및 가격 산출
            return self.calculate_pscore(wbs_1m, ask_res, bid_res, current_price)
        
        return None

    def calculate_pscore(self, wbs, ask_res, bid_res, price):
        """[Task 3-2 대응] P-Score 및 진입/목표/손절 가격 산출"""
        # 1. 구간별 성공률 테이블
        if wbs >= 75: base_score = 71
        elif wbs >= 70: base_score = 58
        elif wbs >= 65: base_score = 42
        else: base_score = 30 

        # 2. 호가 압박 보정
        pressure = bid_res / ask_res if ask_res > 0 else 1.0
        correction = min(15, max(-15, (pressure - 1.0) * 10))
        
        final_pscore = min(100, max(0, base_score + correction))
        if final_pscore < 40: return None
        
        # 3. ROI 및 가격 계산 (목표 2%, 손절 1% - 종목별 가변화 가능)
        win_p = final_pscore / 100
        roi = (win_p * 2.0) - ((1 - win_p) * 1.0)
        
        target_price = int(price * 1.02)
        stop_price = int(price * 0.99)
        
        return {
            "p_score": final_pscore,
            "roi": round(roi, 2),
            "level": self.get_signal_level(final_pscore),
            "entry_price": price,
            "target_price": target_price,
            "stop_price": stop_price
        }

    def get_signal_level(self, score):
        if score >= 75: return "STRONG" # 빨간색
        if score >= 60: return "BUY"    # 주황색
        return "INTEREST" # 노란색 (40~60)
