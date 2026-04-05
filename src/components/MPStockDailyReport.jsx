import React, { useState, useMemo, useEffect } from 'react';
import { LayoutGrid, Flame, CheckCircle, Calendar } from 'lucide-react';
import { useSSE } from '../context/SSEContext';

const MPStockDailyReport = ({ data, isLoading, isFallback }) => {
  const { realtimePrices } = useSSE();
  
  const stocks = useMemo(() => data?.stocks || [], [data]);
  
  // 1. Grouping Logic (v7.6.0)
  const groupedStocks = useMemo(() => {
    const groups = {};
    stocks.forEach(s => {
      const date = s.recommended_at;
      if (!groups[date]) groups[date] = [];
      groups[date].push(s);
    });
    return groups;
  }, [stocks]);

  const dates = useMemo(() => {
    return Object.keys(groupedStocks).sort((a, b) => {
        const [am, ad] = a.split('. ').map(v => v.replace('.', ''));
        const [bm, bd] = b.split('. ').map(v => v.replace('.', ''));
        if (am !== bm) return bm.localeCompare(am);
        return bd.localeCompare(ad);
    });
  }, [groupedStocks]);

  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  const currentStocks = useMemo(() => groupedStocks[selectedDate] || [], [groupedStocks, selectedDate]);

  // [v7.6.5] Unified Logic for Market Open & Today check
  const marketContext = useMemo(() => {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const day = kst.getUTCDay();
    const hour = kst.getUTCHours();
    const minute = kst.getUTCMinutes();
    const timeVal = hour * 100 + minute;
    const isMarketOpenNow = day >= 1 && day <= 5 && timeVal >= 900 && timeVal <= 1535;
    
    const todayStr = `${String(kst.getUTCMonth() + 1).padStart(2, '0')}. ${String(kst.getUTCDate()).padStart(2, '0')}.`;
    const isToday = selectedDate === todayStr;

    return { isMarketOpenNow, isToday };
  }, [selectedDate]);

  // 2. Dynamic Summary Calculation (v7.5.31)
  const stats = useMemo(() => {
    if (currentStocks.length === 0) {
      return { hitRate: '0%', avgYield: '0.0%', count: 0, slRate: '0%', tpRate: '0%' };
    }
    
    let hits = 0;
    let sls = 0;
    let tps = 0;
    let totalYield = 0;
    
    const { isMarketOpenNow, isToday } = marketContext;

    currentStocks.forEach(s => {
        // [v7.5.31] Legacy stocks use precomputed closing price + yield
        if (s.is_legacy) {
            hits++;
            totalYield += (s.yield_pct || 0);
            return;
        }

        const rt = realtimePrices[s.code];
        const displayPrice = rt ? rt.price : (s.current_price || 0);
        const entry = (s.entry_price || s.target_price || 0);
        const sl = s.stop_loss || 0;
        const tp = s.target_price_exit || 0;

        const canUpdateLive = !isToday || isMarketOpenNow;
        const isHitLive = entry > 0 && displayPrice > 0 && displayPrice <= entry;
        const isSL = sl > 0 && displayPrice > 0 && displayPrice <= sl;
        const isTP = tp > 0 && displayPrice > 0 && displayPrice >= tp;

        const isExecuted = (s.status === '체결') || (canUpdateLive && isHitLive);
        const slActive = canUpdateLive && isSL;
        const tpActive = canUpdateLive && isTP;
        
        if (isExecuted) {
            hits++;
            const currentYield = entry > 0 ? ((displayPrice - entry) / entry * 100) : 0;
            totalYield += currentYield;
        }
        
        if (slActive) sls++;
        if (tpActive) tps++;
    });
    
    return { 
        hitRate: ((hits / currentStocks.length) * 100).toFixed(0) + '%', 
        avgYield: hits > 0 ? (totalYield / hits).toFixed(1) + '%' : '0.0%', 
        count: currentStocks.length,
        slRate: ((sls / currentStocks.length) * 100).toFixed(0) + '%',
        tpRate: ((tps / currentStocks.length) * 100).toFixed(0) + '%'
    };
  }, [currentStocks, realtimePrices, marketContext]);

  if (isLoading) return <div style={{padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)'}}>데이터 분석 중...</div>;

  const header = data?.header || {};

  return (
    <div style={{width: '100%', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif', paddingBottom: '3rem'}}>
      <div style={{marginBottom: '2rem'}}>
        <h2 className="lp-report-v41-title">최근 추천 종목 성과 리포트</h2>
        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6}}>
            조회 기준: {header.report_date || '핵심 추천 종목 관리 (최근 10일)'}<br/>
            {header.universe || 'MP KOSPI 200 & KOSDAQ 150 통합 포트폴리오'}
        </div>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', flexWrap: 'wrap'}}>
          <div style={{fontSize: '0.9rem', color: '#888', fontWeight: 500}}>조회 날짜 선택:</div>
          <select 
              value={selectedDate || ''} 
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #333',
                  borderRadius: '12px',
                  padding: '10px 16px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                  minWidth: '200px',
                  transition: 'all 0.2s',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '45px'
              }}
          >
              {dates.map(date => (
                  <option key={date} value={date}>{date} 추천 포트폴리오</option>
              ))}
          </select>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '1rem'}}>
        <LayoutGrid className="text-blue-400" size={20} /> 날짜별 추천 종목 수익률 요약
      </div>
      <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
          marginBottom: '2rem'
      }}>
        <div className="lp-summary-card-v41">
            <h4 style={{ fontWeight: 400, fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>진입 적중률</h4>
            <div className="value" style={{ fontWeight: 400, fontSize: '1rem', color: '#aaa' }}>{stats.hitRate}</div>
        </div>
        <div className="lp-summary-card-v41">
            <h4 style={{ fontWeight: 400, fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>손절률</h4>
            <div className="value" style={{ fontWeight: 400, fontSize: '1rem', color: '#4da6ff' }}>{stats.slRate}</div>
        </div>
        <div className="lp-summary-card-v41">
            <h4 style={{ fontWeight: 400, fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>익절률</h4>
            <div className="value" style={{ fontWeight: 400, fontSize: '1rem', color: '#ff4d4d' }}>{stats.tpRate}</div>
        </div>
        <div className="lp-summary-card-v41">
            <h4 style={{ fontWeight: 400, fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>평균 수익률</h4>
            <div className="value" style={{ fontWeight: 400, fontSize: '1rem', color: '#aaa' }}>{parseFloat(stats.avgYield) >= 0 ? '+' : ''}{stats.avgYield}</div>
        </div>
        <div className="lp-summary-card-v41">
            <h4 style={{ fontWeight: 400, fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>추천 종목 수</h4>
            <div className="value" style={{ fontWeight: 400, fontSize: '1rem', color: '#aaa' }}>{stats.count}종목</div>
        </div>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '2.5rem 0 1rem 0'}}>
        <Flame className="text-orange-500" size={20} fill="#f97316" /> 종목별 상세 리뷰 ({selectedDate})
      </div>
      <div className="lp-report-card">
        <div className="lp-report-table-wrapper">
            <table className="lp-report-table">
                <thead style={{borderBottom: '2px solid #333'}}>
                    <tr>
                        <th style={{color: '#fff', fontWeight: 400, fontSize: '1rem'}}>종목명</th>
                        <th style={{color: '#fff', fontWeight: 400, fontSize: '1rem'}}>손절</th>
                        <th style={{color: '#fff', fontWeight: 400, fontSize: '1rem'}}>익절</th>
                        <th style={{color: '#fff', fontWeight: 400, fontSize: '1rem'}}>매수진입</th>
                        <th style={{color: '#fff', fontWeight: 400, fontSize: '1rem'}}>전략 및 지표</th>
                        <th style={{color: '#fff', fontWeight: 400, fontSize: '1rem', textAlign: 'right'}}>현재가</th>
                        <th style={{color: '#fff', fontWeight: 400, fontSize: '1rem', textAlign: 'right'}}>수익률</th>
                    </tr>
                </thead>
                <tbody>
                    {currentStocks.map((stock, idx) => {
                        // [v7.5.31] Legacy mode: show closing price of that date, no SL/TP/Entry display
                        const isLegacy = !!stock.is_legacy;
                        const rt = realtimePrices[stock.code];
                        const entry = (stock.entry_price || stock.target_price || 0);
                        const sl = stock.stop_loss || 0;
                        const tp = stock.target_price_exit || 0;

                        const { isMarketOpenNow, isToday } = marketContext;
                        const canUpdateLive = !isToday || isMarketOpenNow;

                        // For legacy: use precomputed closing price; for active: use live if available
                        const displayPrice = isLegacy
                            ? (stock.current_price || entry)
                            : (rt ? rt.price : (stock.current_price || 0));

                        // [v7.6.7] Improved Legacy Detection for Labels
                        const isBeforeApril4 = (date) => {
                            if (!date) return false;
                            const [m, d] = date.split('. ').map(v => parseInt(v.replace('.', '')));
                            if (m < 4) return true;
                            if (m === 4 && d <= 3) return true;
                            return false;
                        };
                        const isLegacyLabel = isLegacy || isBeforeApril4(stock.recommended_at);

                        const isSL = !isLegacy && sl > 0 && displayPrice > 0 && displayPrice <= sl && canUpdateLive;
                        const isTP = !isLegacy && tp > 0 && displayPrice > 0 && displayPrice >= tp && canUpdateLive;

                        // Yield: for legacy use precomputed value; for active compute live
                        let displayYield = stock.yield_pct || 0;
                        if (!isLegacy) {
                            const isExecuted = (stock.status === '체결') || (canUpdateLive && entry > 0 && displayPrice > 0 && displayPrice <= entry);
                            if (isExecuted && canUpdateLive) {
                                const calcPrice = rt ? rt.price : (stock.current_price || 0);
                                if (entry > 0 && calcPrice > 0) {
                                    displayYield = Number(((calcPrice - entry) / entry * 100).toFixed(2));
                                } else {
                                    displayYield = 0;
                                }
                            } else if (!isExecuted) {
                                displayYield = 0;
                            }
                        }

                        const isExecuted = isLegacy ? true : ((stock.status === '체결') || (canUpdateLive && entry > 0 && displayPrice > 0 && displayPrice <= entry));
                        const bodyFontSize = '0.95rem';

                        return (
                            <tr key={idx} style={{borderBottom: '1px solid #222'}}>
                                <td style={{padding: '16px 8px'}}>
                                    <a 
                                        href={`https://www.tradingview.com/chart/?symbol=KRX:${stock.code}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{textDecoration: 'none'}}
                                    >
                                        <div style={{fontSize: '0.95rem', fontWeight: 400, color: 'var(--primary)', cursor: 'pointer'}}>{stock.name}</div>
                                    </a>
                                    <div style={{fontSize: '0.8rem', color: '#666'}}>({stock.code})</div>
                                </td>

                                {/* 손절 컬럼 */}
                                <td style={{padding: '16px 8px'}}>
                                    <div style={{fontSize: '0.95rem', color: isSL ? '#4da6ff' : '#444', fontWeight: 400}}>
                                        {isLegacy ? '-' : isSL ? (
                                            <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                                                <span>손절 터치</span>
                                                <span style={{fontSize: '0.75rem', opacity: 0.8}}>{stock.execution_time || new Date().toLocaleString('ko-KR', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'})}</span>
                                            </div>
                                        ) : '-'}
                                    </div>
                                </td>

                                {/* 익절 컬럼 */}
                                <td style={{padding: '16px 8px'}}>
                                    <div style={{fontSize: '0.95rem', color: isTP ? '#ff4d4d' : '#444', fontWeight: 400}}>
                                        {isLegacy ? '-' : isTP ? (
                                            <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                                                <span>익절 달성</span>
                                                <span style={{fontSize: '0.75rem', opacity: 0.8}}>{stock.execution_time || new Date().toLocaleString('ko-KR', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'})}</span>
                                            </div>
                                        ) : '-'}
                                    </div>
                                </td>

                                {/* 매수진입 컬럼 */}
                                <td style={{padding: '16px 8px'}}>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.95rem'}}>
                                        {isLegacy ? (
                                            <span style={{color: '#666', fontWeight: 400}}>-</span>
                                        ) : isExecuted ? (
                                            <div style={{color: '#22c55e', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '4px'}}>
                                                <CheckCircle size={16} /> 체결됨
                                            </div>
                                        ) : (
                                            <span style={{color: '#666', fontWeight: 400}}>미체결</span>
                                        )}
                                    </div>
                                </td>
                                <td style={{padding: '16px 8px'}}>
                                    <div style={{fontSize: '0.9rem', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '5px'}}>
                                        <div>• 총점: <span style={{color: '#d4af37', fontWeight: 400}}>{stock.score}점</span> <span className="lp-stars">{'★'.repeat(Math.max(0, Math.floor(stock.stars || 0)))}</span></div>
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '6px', backgroundColor: '#111', borderRadius: '4px', marginTop: '2px'}}>
                                            <span style={{color: '#fff', fontWeight: 400}}>1차매수: {(stock.entry_price || stock.target_price || 0).toLocaleString()}원</span>
                                            <span style={{color: '#fff', fontWeight: 400}}>2차매수: {(stock.entry_price_2 || 0).toLocaleString()}원</span>
                                            <span style={{color: '#4da6ff', fontWeight: 400}}>손절: {sl > 0 ? sl.toLocaleString() + '원' : '-'}</span>
                                            <span style={{color: '#ff4d4d', fontWeight: 400}}>목표: {tp > 0 ? tp.toLocaleString() + '원' : '-'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{textAlign: 'right', padding: '16px 8px'}}>
                                    <div style={{fontSize: '0.95rem', fontWeight: 400, color: '#fff'}}>
                                        {Math.round(displayPrice).toLocaleString()}원
                                    </div>
                                    <div style={{fontSize: '0.75rem', color: '#555'}}>{isLegacyLabel ? '조회일 종가' : stock.recommended_at}</div>
                                </td>
                                <td style={{textAlign: 'right', padding: '16px 8px'}}>
                                    <div style={{
                                        fontSize: '1.2rem', 
                                        fontWeight: 900, 
                                        color: displayYield > 0 ? '#ff4d4d' : (displayYield < 0 ? '#4da6ff' : '#888')
                                    }}>
                                        {displayYield > 0 ? '+' : ''}{displayYield}%
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </div>
      <footer style={{
          marginTop: '3rem',
          padding: '2rem 0',
          borderTop: '1px solid #222',
          textAlign: 'right',
          color: '#444',
          fontSize: '0.8rem'
      }}>
        v7.6.6 - Trading Intelligence System | Finalized Stats & Auto-status Detection
      </footer>
    </div>
  );
};

export default MPStockDailyReport;
