import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, LayoutGrid, Flame, Lightbulb } from 'lucide-react';

const MPStockDailyReport = ({ data, isLoading, isFallback }) => {
  if (isLoading) return <div style={{padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)'}}>데이터 분석 중...</div>;

  const stocks = data?.stocks || [];
  const summary = data?.summary || {};
  const header = data?.header || {};

  return (
    <div style={{width: '100%', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif'}}>
      {/* Title Section */}
      <div style={{marginBottom: '2rem'}}>
        <h2 className="lp-report-v41-title">MP Stock Daily 성과 리포트</h2>
        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6}}>
            발행일: {header.report_date || '2026. 03. 25'}<br/>
            {header.universe || 'KOSPI 200 & KOSDAQ 150 추천 포트폴리오'}
        </div>
      </div>

      {/* Summary Section */}
      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '1rem'}}>
        <LayoutGrid className="text-blue-400" size={20} /> 종합 요약
      </div>
      <div className="lp-summary-grid-v41">
        <div className="lp-summary-card-v41">
            <h4>금일 적중률</h4>
            <div className="value">{summary.hit_rate || '알 수 없습니다'}</div>
            <p style={{fontSize: '0.65rem', color: '#666', marginTop: '0.5rem'}}>*가격 변동 데이터 부재로 체결 여부 판단 불가</p>
        </div>
        <div className="lp-summary-card-v41">
            <h4>금일 수익률</h4>
            <div className="value">{summary.avg_yield || '알 수 없습니다'}</div>
            <p style={{fontSize: '0.65rem', color: '#666', marginTop: '0.5rem'}}>*매일 종목 리포트 제공</p>
        </div>
        <div className="lp-summary-card-v41">
            <h4>금일 추천 포트폴리오</h4>
            <div className="value">{summary.portfolio_size || 5}종목</div>
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
                        <th style={{color: 'var(--primary)', fontWeight: 800}}>종목명</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800}}>매수진입</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800}}>진입 전략 및 점수</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800}}>추천일</th>
                        <th style={{color: 'var(--primary)', fontWeight: 800, textAlign: 'right'}}>수익률</th>
                    </tr>
                </thead>
                <tbody>
                    {stocks.map((stock, idx) => (
                        <tr key={idx} style={{borderBottom: '1px solid #222'}}>
                            <td>
                                <div style={{fontSize: '1rem', fontWeight: 800, color: '#fff'}}>{stock.name}</div>
                                <div style={{fontSize: '0.75rem', color: '#666'}}>({stock.code})</div>
                            </td>
                            <td>
                                <span className="lp-badge-v41-uncertain">{stock.status}</span>
                            </td>
                            <td>
                                <div style={{fontSize: '0.85rem', color: '#fff', marginBottom: '0.25rem'}}>
                                    • 추천 총점: {stock.score}점 
                                    <span className="lp-stars">{'★'.repeat(stock.stars)}</span>
                                </div>
                                <div style={{fontSize: '0.85rem', color: '#fff'}}>
                                    • 1차 매수진입가: {(stock.target_price || 0).toLocaleString()}원
                                </div>
                            </td>
                            <td>
                                <div style={{fontSize: '0.85rem', color: '#fff'}}>{stock.recommended_at}</div>
                            </td>
                            <td style={{textAlign: 'right'}}>
                                <div style={{fontSize: '1.25rem', fontWeight: 900, color: '#ff4d4d'}}>
                                    +{stock.yield_pct}%
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>

      {/* Note Section */}
      <div className="lp-note-box">
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: '#aaa', marginBottom: '0.75rem'}}>
            <Lightbulb size={16} /> 참고
        </div>
        {data.note ? data.note.split('\n').map((line, i) => <div key={i}>{line}</div>) : (
            <>
                현재 장중 저가(Low) 데이터를 알 수 없어 1차 전략가 도달 이력(매수전입 상정/실패)을 단정 지을 수 없습니다.<br/>
                따라서 종합 요약의 '적중률'과 '금일 수익률'은 보수적으로 비워두었습니다.
            </>
        )}
      </div>

      {/* Footer */}
      <div style={{marginTop: '3rem', borderTop: '1px solid #222', paddingTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: '#555'}}>
        © 2026 MP Signal Studio | All Rights Reserved. | System Architect: Jung-han Choi
      </div>
    </div>
  );
};

export default MPStockDailyReport;
