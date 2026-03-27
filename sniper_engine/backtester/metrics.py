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
        self.fee_rate = 0.00015  # 증권사 수수료 (가정 0.015%)
        self.tax_rate = 0.0020   # 증권거래세 (0.2%, 매도 시)
        
    def calculate_roi(self):
        positions = {}
        realized_pnl = 0.0
        total_trades = 0
        winning_trades = 0
        
        for action in self.trade_log:
            sig_type = action.get("type")
            ticker = action.get("ticker", "Unknown")
            raw_price = action.get("price", 0)
            sig_id = action.get("signal_id")
            
            if sig_type == "ENTRY":
                # 🔴 [Red Team 지적 사항 즉결 패치] 
                # 시장가 시장 진입 시 '호가창 밀림(Slippage)' 0.7% 손해를 강제 추가. 
                # (예: 타점 폭발 시 165000원 -> 실제 시장가 체결 166155원)
                slippage_penalty = raw_price * 0.007 
                executed_price = raw_price + slippage_penalty
                
                positions[sig_id] = {
                    "entry_price": executed_price,
                    "ticker": ticker
                }
            
            elif sig_type == "EXIT_WARN" and sig_id in positions:
                # 🔴 [Red Team 지적 사항 즉결 패치] Tracker 가 넘긴 당시 시세(raw_price)로 정산
                entry_price = positions[sig_id]["entry_price"]
                
                # 매각 시에도 탈출 슬리피지(호가 공백) 페널티 0.7% 폭격 부여
                exit_slippage = raw_price * 0.007

                
                # 최종 세금 + 페널티 맞고 들어온 세후 매도 체결단가
                executed_exit_price = raw_price - exit_slippage - (raw_price * self.tax_rate) - (raw_price * self.fee_rate)
                
                pnl_pct = ((executed_exit_price - entry_price) / entry_price) * 100
                realized_pnl += pnl_pct
                total_trades += 1
                
                if pnl_pct > 0:
                    winning_trades += 1
                    logger.info(f"🟢 [WIN] {ticker} Net: +{pnl_pct:.2f}% (Taxes Deducted)")
                else:
                    logger.warning(f"🔴 [LOSS] {ticker} Net: {pnl_pct:.2f}% (Taxes Deducted)")
                    
                del positions[sig_id]
                
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0.0
        
        logger.info(f"========== 📊 TOTAL BACKTEST RESULTS ==========")
        logger.info(f"Total Completed Trades: {total_trades}")
        logger.info(f"Aggregated Net PnL    : {realized_pnl:.2f} %")
        logger.info(f"Survival Win Rate     : {win_rate:.1f} %")
        logger.info(f"===============================================")
        
        return {
            "total_trades": total_trades,
            "win_rate": win_rate,
            "net_pnl": realized_pnl
        }
