# sniper_engine/backtester/metrics.py
import logging

logger = logging.getLogger("Metrics")
logger.setLevel(logging.INFO)

class TradeMetrics:
    """
    🔵 [Blue Team] 매매 결과(Trade Log) 승률 / 누적 손익 연산기 (Task 6.3)
    Simulator가 토해낸 Signal JSON 데이터를 바탕으로 최종 수치를 리포트합니다.
    """
    def __init__(self, trade_log: list):
        self.trade_log = trade_log
        self.fee_rate = 0.00015  # 증권사 수수료 (0.015%)
        self.tax_rate = 0.0018   # 증권거래세 (0.18%, 코스피/코스닥 평균)
        self.slippage = 0.0015   # 슬리피지 보정 (0.15%, 보수적 관점 유지)
        
    def calculate_roi(self):
        # [Blue Team] 시뮬레이션 종료 후 누적된 trade_log를 분석하여 통계를 산출합니다.
        positions = {}
        total_pnl_pct_sum = 0.0
        total_exits = 0
        ticker_stats = {}
        
        # 1. 시그널 순회 및 매칭
        for action in self.trade_log:
            sig_type = action.get("type")
            ticker = action.get("ticker", "UNKNOWN")
            sig_id = action.get("signal_id")
            price = float(action.get("price", 0))
            
            if ticker not in ticker_stats:
                ticker_stats[ticker] = {"total": 0, "wins": 0, "pnl_sum": 0.0}

            if sig_type == "ENTRY":
                # 동일 sig_id에 대한 중복 진입 방지 (백테스트 데이터 오염 방어)
                if sig_id not in positions:
                    positions[sig_id] = {"entry_price": price, "ticker": ticker}
                    
            elif sig_type == "EXIT_WARN":
                if sig_id in positions:
                    pos = positions[sig_id]
                    entry_p = pos["entry_price"]
                    exit_p = price
                    
                    if entry_p > 0:
                        # [v9.1.1] 슬리피지 및 세금 현실적 반영 (0.15% 매수 + 0.18% 매도/세금 = 0.33%)
                        pnl_pct = ((exit_p - entry_p) / entry_p * 100) - 0.33
                        
                        total_pnl_pct_sum += pnl_pct
                        total_exits += 1
                        
                        t_stat = ticker_stats[ticker]
                        t_stat["total"] += 1
                        t_stat["pnl_sum"] += pnl_pct
                        if pnl_pct > 0:
                            t_stat["wins"] += 1
                    
                    del positions[sig_id]

        # 2. 최종 지표 산출 (산술 평균 ROI)
        avg_roi = (total_pnl_pct_sum / total_exits) if total_exits > 0 else 0.0
        win_rate = (sum(s["wins"] for s in ticker_stats.values()) / total_exits * 100) if total_exits > 0 else 0.0

        by_ticker = {}
        for t, s in ticker_stats.items():
            by_ticker[t] = {
                "total": s["total"],
                "win_rate": (s["wins"] / s["total"] * 100) if s["total"] > 0 else 0.0,
                "net_pnl": (s["pnl_sum"] / s["total"]) if s["total"] > 0 else 0.0 # 종목별 평균 수익률
            }

        return {
            "win_rate": win_rate,     # 전체 승률
            "avg_pnl": avg_roi,      # [v9.1.1] 전체 평균 수익률 (Mean ROI)
            "total_trades": total_exits,
            "by_ticker": by_ticker,
            "trade_log": self.trade_log[-100:] # 최근 100건만 UI 전달
        }
