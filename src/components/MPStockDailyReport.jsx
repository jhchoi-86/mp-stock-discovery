import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, LayoutGrid, Flame, Lightbulb, CheckCircle } from 'lucide-react';

const MPStockDailyReport = ({ data, isLoading, isFallback }) => {
  if (isLoading) return <div style={{padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)'}}>데이터 분석 중...</div>;

  const stocks = data?.stocks || [];
  const summary = data?.summary || {};
  const header = data?.header || {};

  return (
    <div style={{width: '100%', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif'}}>
      {/* Title Section */}
      <div style={{marginBottom: '2rem'}}>
        <h2 className="lp-report-v41-title">최근 추천 종목 성과 리포트</h2>
        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6}}>
            조회 기준: {header.report_date || '누적 추천 현황'}<br/>
            {header.universe || 'MP KOSPI 200 & KOSDAQ 150 통합 포트폴리오'}
        </div>
      </div>

      {/* Summary Section */}
      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '1rem'}}>
        <LayoutGrid className="text-blue-400" size={20} /> 종합 요약 (최근 {stocks.length}개 종목)
      </div>
      <div className="lp-summary-grid-v41">
        <div className="lp-summary-card-v41">
            <h4>누적 적중률</h4>
            <div className="value">{summary.hit_rate || '0%'}</div>
        </div>
        <div className="lp-summary-card-v41">
            <h4>평균 수익률</h4>
            <div className="value">{summary.avg_yield || '0.0%'}</div>
        </div>
        <div className="lp-summary-card-v41">
            <h4>활성 종목 수</h4>
            <div className="value">{summary.portfolio_size || stocks.length}종목</div>
        </div>
      </div>

      {/* Detail Section */}
      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '2.5rem 0 1rem 0'}}>
        <Flame className="text-orange-500" size={20} fill="#f97316" /> 종목별 상세 리뷰
      </div>
      <div className="lp-report-card">
        <div className="lp-report-table-wrapper">
            <table className="lp-report-table">
                <thead style={{borderBottom: '2px solid #333'}}>
                    <tr>
                        <th style={{color: 'var(--primary)', fontWeight: 800, fontSize: '1rem'}}>종목명</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800, fontSize: '1rem'}}>매수진입</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800, fontSize: '1rem'}}>진입 전략 및 점수</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800, fontSize: '1rem'}}>추천일</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800, fontSize: '1rem', textAlign: 'right'}}>현재가</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800, fontSize: '1rem', textAlign: 'right'}}>수익률</th>
                    </tr>
                </thead>
                <tbody>
                    {stocks.map((stock, idx) => (
                        <tr key={idx} style={{borderBottom: '1px solid #222'}}>
                            <td>
                                <a 
                                    href={`https://www.tradingview.com/chart/?symbol=KRX:${stock.code}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="lp-stock-link"
                                    style={{textDecoration: 'none'}}
                                >
                                    <div style={{fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', cursor: 'pointer'}}>{stock.name}</div>
                                </a>
                                <div style={{fontSize: '0.75rem', color: '#666'}}>({stock.code})</div>
                            </td>

                            <td>
                                {stock.status === '체결' ? (
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                                        <div style={{color: '#22c55e', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px'}}>
                                            <CheckCircle size={16} /> 체결
                                        </div>
                                        {stock.execution_time && (
                                            <div style={{fontSize: '0.7rem', color: '#666', fontWeight: 500}}>
                                                {stock.execution_time.split(' ')[1]} {stock.execution_time.split(' ')[0].substring(5)}
                                            </div>
                                        )}
                                    </div>
                                ) : (

                                    <span className="lp-badge-pending">{stock.status}</span>
                                )}
                            </td>
                            <td>
                                <div style={{fontSize: '0.85rem', color: '#fff', marginBottom: '0.25rem'}}>
                                    • 추천 총점: {stock.score}점 
                                    <span className="lp-stars">{'★'.repeat(Math.max(0, Math.floor(stock.stars || 0)))}</span>
                                </div>
                                <div style={{fontSize: '0.85rem', color: '#fff'}}>
                                    • 1차 매수진입가: {(stock.target_price || 0).toLocaleString()}원
                                </div>
                            </td>
                            <td>
                                <div style={{fontSize: '1rem', fontWeight: 800, color: '#fff'}}>{stock.recommended_at}</div>
                            </td>
                             <td style={{textAlign: 'right'}}>
                                <div style={{fontSize: '1rem', fontWeight: 800, color: '#fff'}}>
                                    {(stock.current_price || 0).toLocaleString()}원
                                </div>
                            </td>
                             <td style={{textAlign: 'right'}}>
                                <div style={{
                                    fontSize: '1.25rem', 
                                    fontWeight: 900, 
                                    color: stock.yield_pct > 0 ? '#ff4d4d' : (stock.yield_pct < 0 ? '#4da6ff' : '#888')
                                }}>
                                    {stock.yield_pct > 0 ? '+' : ''}{stock.yield_pct}%
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
      <div style={{marginTop: '1.5rem', textAlign: 'right', fontSize: '0.7rem', color: '#666', fontStyle: 'italic', borderTop: '1px solid #222', paddingTop: '1rem'}}>
          v4.7.2 - Refined Cumulative History (Main Portfolios)
      </div>
    </div>
  );
};

export default MPStockDailyReport;
