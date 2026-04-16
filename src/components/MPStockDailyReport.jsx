import { useMemo, useState, useEffect } from 'react';
import useSWR from 'swr';
import { LayoutGrid, History, CheckCircle, Flame } from 'lucide-react';
import { useSSE } from '../hooks/useSSE';
import adminService from '../api/adminService';
import { useTop5Stocks } from '../hooks/useStockSnapshot';
// [v8.0.0] DailyTop5 DB Sync & Multi-Timeframe Integration
// [v8.8.12] Price Update Highlight Animation

const PriceDisplay = ({ price, changeRate, label }) => {
  const isPositive = changeRate > 0;
  const isNegative = changeRate < 0;
  const color = isPositive ? '#ff4d4d' : (isNegative ? '#4da6ff' : '#888');
  
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
        {price?.toLocaleString()}원
      </div>
      <div style={{ fontSize: '0.8rem', color, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
        <span>{isPositive ? '▲' : (isNegative ? '▼' : '')}</span>
        <span>{Math.abs(changeRate || 0).toFixed(2)}%</span>
      </div>
      {label && <div style={{ fontSize: '0.7rem', color: '#555', marginTop: '2px' }}>{label}</div>}
    </div>
  );
};

const MPStockDailyReport = ({ data, isLoading }) => {
  const { realtimePrices } = useSSE();
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [historicalData, setHistoricalData] = useState(null);
  const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);

  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []); 
  const { data: top5Response } = useTop5Stocks(selectedDate || today);
  const dbTop5 = top5Response;
  const { data: historyTags } = useSWR('/api/public/sync-history-tags', adminService.getSyncHistoryTags);

  // [v9.4.17] Robust mapping for both legacy (.stocks) and SSOT (.data) formats
  const stocks = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : (data.stocks || data.data || []);
  }, [data]);
  
  // 1. Grouping Logic (v7.6.0)
  const groupedStocks = useMemo(() => {
    const groups = {};
    stocks.forEach(s => {
      const date = s.recommended_at;
      if (!date || date === 'undefined') return; // [v9.5.0] Filter out invalid dates
      if (!groups[date]) groups[date] = [];
      groups[date].push(s);
    });
    return groups;
  }, [stocks]);

  const dates = useMemo(() => {
    return Object.keys(groupedStocks)
      .filter(d => d && d !== 'undefined') // [v9.5.0] Double check filter
      .sort((a, b) => {
        const [am, ad] = a.split('. ').map(v => v.replace('.', ''));
        const [bm, bd] = b.split('. ').map(v => v.replace('.', ''));
        if (am && bm && am !== bm) return bm.localeCompare(am);
        if (ad && bd) return bd.localeCompare(ad);
        return 0;
    });
  }, [groupedStocks]);

  useEffect(() => {
    // [v9.5.0] Prioritize latest saved sync history as default
    if (historyTags && historyTags.length > 0 && !selectedTag && !selectedDate) {
      setSelectedTag(historyTags[0].tagName);
      return;
    }
    
    if (!selectedDate && dates.length > 0 && !selectedTag) {
      const validDate = dates.find(d => d && d !== 'undefined');
      if (validDate) setSelectedDate(validDate);
    }
  }, [dates, selectedTag, selectedDate, historyTags]);

  // Load Historical Details (v8.8.18)
  useEffect(() => {
    async function fetchHistory() {
      if (!selectedTag) {
        setHistoricalData(null);
        return;
      }
      setIsHistoricalLoading(true);
      try {
        const details = await adminService.getSyncHistoryDetails(selectedTag);
        if (details) {
          // Map historical snapshot fields to UI consistent format
          const mapped = details.map(s => ({
            code: s.code,
            name: s.name,
            current_price: s.currentPrice,
            entry1: s.entryPrice1,
            entry_price: s.entryPrice1,
            entry2: s.entryPrice2,
            target: s.targetPrice1,
            sl: s.stopLoss,
            yield_pct: s.yield,
            score: s.score,
            stars: s.score >= 95 ? 5 : (s.score >= 90 ? 4 : 3),
            trend_type: s.category || '기타',
            recommended_at: selectedTag.split(' ')[0]
          }));
          setHistoricalData(mapped);
        }
      } catch (e) {
        console.error('[Historical Fetch Error]', e);
      } finally {
        setIsHistoricalLoading(false);
      }
    }
    fetchHistory();
  }, [selectedTag]);

  const currentStocks = useMemo(() => {
    if (selectedTag && historicalData) return historicalData;
    const raw = (groupedStocks[selectedDate] || []);
    return raw.filter(s => s.code !== 'TEST_ERR' && s.code !== 'TEST_EXM');
  }, [groupedStocks, selectedDate, selectedTag, historicalData]);

  // [v8.0.0] Fetch DailyTop5 from DB for additional metrics (Foreign/Inst/Score)
  const dbDate = useMemo(() => {
    if (!selectedDate) return '';
    // Convert "04. 06." to "2026-04-06"
    const [m, d] = selectedDate.split('. ').map(v => v.replace('.', ''));
    if (!m || !d) return '';
    const year = new Date().getFullYear();
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }, [selectedDate]);

  // Merge DB data with currentStocks and Handle Duplicates
  const enrichedStocks = useMemo(() => {
    // 1. Create a unique map based on codes to prevent duplicates
    const stocksMap = new Map();

    // 2. Add stocks from dbTop5 (Source of Truth) first
    // [v9.1.6] 히스토리 태그가 선택된 경우, 실시간 DB 데이터 병합을 생략하여 시점 데이터를 보존함
    if (!selectedTag && dbTop5 && dbTop5.data) {
      dbTop5.data.forEach(db => {
        const dbCode = db.ticker || db.code;
        if (!dbCode) return;
        stocksMap.set(dbCode, {
          code: dbCode,
          name: db.name,
          score: db.score,
          current_price: db.currentPrice,
          entry_price: db.entryPrice1,
          entry1: db.entryPrice1,
          entry2: db.entryPrice2,
          entry_price_2: db.entryPrice2,
          target: db.targetPrice1,
          target_price: db.targetPrice1,
          sl: db.stopLoss,
          stop_loss: db.stopLoss,
          foreign_buy: db.foreignBuy !== undefined ? (db.foreignBuy > 0 ? '+' : '') + db.foreignBuy.toLocaleString() + '주' : '0주',
          inst_buy: db.instBuy !== undefined ? (db.instBuy > 0 ? '+' : '') + db.instBuy.toLocaleString() + '주' : '0주',
          trade_amount: db.tradeAmount ? (Number(db.tradeAmount) / 100000000).toFixed(0) + '억' : '0억',
          trend_type: db.category,
          recommended_at: dbDate ? dbDate.split('-').slice(1).join('. ') + '.' : (selectedDate || today),
          stars: db.score >= 95 ? 5 : (db.score >= 90 ? 4 : 3)
        });
      });
    }

    // 3. Merge with currentStocks (from JSON), ensuring no duplicates and preserving unique fields
    currentStocks.forEach(s => {
      const code = s.ticker || s.code;
      if (!code) return;
      const baseEntry1 = s.entryPrice1 || s.entry_price || s.entry1 || 0;
      const baseEntry2 = s.entryPrice2 || s.entry_price_2 || s.entry2 || 0;
      const baseSL = s.stopLoss || s.stop_loss || s.sl || 0;
      const baseTarget = s.targetPrice1 || s.target_price || s.target || 10000000;
      const livePrice = realtimePrices?.[code]?.price;

      if (stocksMap.has(code)) {
        // Enriched existing from DB preferred for price stats
        const existing = stocksMap.get(code);
        stocksMap.set(code, {
          ...s,
          ...existing,
          current_price: livePrice || existing.current_price || s.currentPrice || s.current_price
        });
      } else {
        // If not in DB for some reason, keep from JSON
        stocksMap.set(code, {
          ...s,
          current_price: livePrice || s.currentPrice || s.current_price,
          entry_price: baseEntry1,
          entry1: baseEntry1,
          entry2: baseEntry2,
          entry_price_2: baseEntry2,
          stop_loss: baseSL,
          sl: baseSL,
          target: baseTarget,
          target_price: baseTarget
        });
      }
    });

    return Array.from(stocksMap.values()).slice(0, 5);
  }, [currentStocks, dbTop5, realtimePrices, dbDate, selectedDate, today]);

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
        const displayPrice = (isToday && isMarketOpenNow && rt) ? rt.price : (s.current_price || 0);
        const entry = (s.entry_price || s.entry1 || s.target_price || 0);
        const sl = s.stop_loss || s.sl || 0;
        const tp = s.target_price_exit || s.target || 0;

        const canUpdateLive = isToday && isMarketOpenNow;
        
        // [v7.7.48] 체결 상태면 가격 조건 없이 즉시 수익률 합산 대상
        const isExecuted = (s.status === '체결') || (canUpdateLive && entry > 0 && displayPrice > 0 && displayPrice <= entry);
        const isSL = sl > 0 && displayPrice > 0 && displayPrice <= sl;
        const isTP = tp > 0 && displayPrice > 0 && displayPrice >= tp;

        const slActive = canUpdateLive && isSL;
        const tpActive = canUpdateLive && isTP;
        
        if (isExecuted) {
            hits++;
            if (entry > 0 && displayPrice > 0) {
                const currentYield = ((displayPrice - entry) / entry * 100);
                totalYield += currentYield;
            }
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
        <h2 className="lp-report-v41-title">최근 추천 종목 성과 리포트 [v9.1.9]</h2>
        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6}}>
            조회 기준: {header.report_date || '핵심 추천 종목 관리 (최근 10일)'}<br/>
            {header.universe || 'MP KOSPI 200 & KOSDAQ 150 통합 포트폴리오'}
        </div>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', flexWrap: 'wrap'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#888', fontWeight: 500}}>
            <History size={16} /> 조회 날짜 선택:
          </div>
          <select 
              value={selectedTag ? `TAG:${selectedTag}` : selectedDate} 
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('TAG:')) {
                  setSelectedTag(val.replace('TAG:', ''));
                  setSelectedDate('');
                } else {
                  setSelectedDate(val);
                  setSelectedTag('');
                }
              }}
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
                  minWidth: '280px',
                  transition: 'all 0.2s',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '45px'
              }}
          >
              <optgroup label="📅 최근 일자별 보고서">
                {dates.map(date => (
                    <option key={date} value={date}>
                        {(date && date !== 'undefined') ? `${date} 추천 포트폴리오` : '추천 포트폴리오'}
                    </option>
                ))}
              </optgroup>
              {historyTags && historyTags.length > 0 && (
                <optgroup label="🕒 저장된 동기화 시점 (Database)">
                  {historyTags.map(tag => (
                    <option key={tag.tagName} value={`TAG:${tag.tagName}`}>
                      {tag.tagName} 저장 시점
                    </option>
                  ))}
                </optgroup>
              )}
          </select>
          {isHistoricalLoading && <span style={{fontSize: '0.8rem', color: 'var(--primary)', animation: 'pulse 1.5s infinite'}}>히스토리 불러오는 중...</span>}
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
        <Flame className="text-orange-500" size={20} fill="#f97316" /> 종목별 상세 리뷰 ({selectedTag || (selectedDate && selectedDate !== 'undefined' ? selectedDate : '최근')})
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
                    {enrichedStocks.map((stock, idx) => {
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
                            ? (stock.current_price || 0)
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

                        const isExecuted = isLegacy ? true : ((stock.status === '체결') || (canUpdateLive && entry > 0 && displayPrice > 0 && displayPrice <= entry));
                        const isSL = !isLegacy && isExecuted && sl > 0 && displayPrice > 0 && displayPrice <= sl && canUpdateLive;
                        const isTP = !isLegacy && isExecuted && tp > 0 && displayPrice > 0 && displayPrice >= tp && canUpdateLive;

                        let displayYield = stock.yield_pct || 0;
                        
                        if (!isLegacy) {
                            if (isExecuted && canUpdateLive) {
                                const calcPrice = rt ? rt.price : (stock.current_price || 0);
                                if (entry > 0 && calcPrice > 0) {
                                    displayYield = Number(((calcPrice - entry) / entry * 100).toFixed(2));
                                } else {
                                    displayYield = 0;
                                }
                            } else {
                                displayYield = 0;
                            }
                        }

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
                                                <span style={{fontSize: '0.75rem', opacity: 0.8}}>{stock.execution_time || (isToday ? '실시간 감시 중' : '당일 마감')}</span>
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
                                                <span style={{fontSize: '0.75rem', opacity: 0.8}}>{stock.execution_time || (isToday ? '실시간 감시 중' : '당일 마감')}</span>
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
                                    <div style={{fontSize: '0.9rem', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                        {/* 1. Score & Trend Header */}
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <div>
                                                <span style={{color: '#d4af37', fontWeight: 800, fontSize: '1rem'}}>{stock.score}점</span>
                                                <span className="text-xs text-slate-500 font-mono">v9.1.9 Cloud Sync</span>
                                                <span className="lp-stars" style={{marginLeft: '4px'}}>{'★'.repeat(Math.max(0, Math.floor(stock.stars || 0)))}</span>
                                            </div>
                                            <div style={{display: 'flex', gap: '4px'}}>
                                                <span style={{fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(212,175,55,0.1)', color: '#d4af37', borderRadius: '4px', border: '1px solid rgba(212,175,55,0.2)'}}>{stock.trend_type || '분석중'}</span>
                                                <span style={{fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: '4px'}}>{stock.trend_strength || '보통'}</span>
                                            </div>
                                        </div>

                                        {/* 2. Core Strategic Prices (2x2 Grid) */}
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', padding: '8px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)'}}>
                                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                                <span style={{fontSize: '0.65rem', color: '#666', marginBottom: '1px'}}>1차매수</span>
                                                <span style={{color: '#fff', fontWeight: 600, fontSize: '0.85rem'}}>{(stock.entry_price || stock.entry1 || stock.target_price || 0).toLocaleString()}원</span>
                                            </div>
                                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                                <span style={{fontSize: '0.65rem', color: '#666', marginBottom: '1px'}}>2차매수</span>
                                                <span style={{color: '#fff', fontWeight: 600, fontSize: '0.85rem'}}>{(stock.entry_price_2 || stock.entry2 || 0).toLocaleString()}원</span>
                                            </div>
                                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                                <span style={{fontSize: '0.65rem', color: '#666', marginBottom: '1px'}}>손절가</span>
                                                <span style={{color: '#4da6ff', fontWeight: 700, fontSize: '0.85rem'}}>{sl > 0 ? sl.toLocaleString() : (stock.sl ? stock.sl.toLocaleString() : '-')}원</span>
                                            </div>
                                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                                <span style={{fontSize: '0.65rem', color: '#666', marginBottom: '1px'}}>목표가</span>
                                                <span style={{color: '#ff4d4d', fontWeight: 700, fontSize: '0.85rem'}}>{tp > 0 ? tp.toLocaleString() : (stock.target ? stock.target.toLocaleString() : '-')}원</span>
                                            </div>
                                        </div>

                                        {/* 3. Market Supply & Volume */}
                                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', padding: '0 4px'}}>
                                            <div style={{display: 'flex', gap: '8px'}}>
                                                <span style={{color: '#888'}}>거래 <span style={{color: stock.trade_amount?.includes('+') || stock.trade_amount > 0 ? '#ff4d4d' : '#4da6ff'}}>{stock.trade_amount || '-'}</span></span>
                                                <span style={{color: '#888'}}>외인 <span style={{color: String(stock.foreign_buy).includes('+') ? '#ff4d4d' : (String(stock.foreign_buy).includes('-') ? '#4da6ff' : '#fff')}}>{stock.foreign_buy || '0'}</span></span>
                                                <span style={{color: '#888'}}>기관 <span style={{color: String(stock.inst_buy).includes('+') ? '#ff4d4d' : (String(stock.inst_buy).includes('-') ? '#4da6ff' : '#fff')}}>{stock.inst_buy || '0'}</span></span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{textAlign: 'right', padding: '16px 8px'}}>
                                    <PriceDisplay 
                                        price={displayPrice} 
                                        changeRate={rt ? rt.changeRate : (stock.change_rate || 0)}
                                        label={isLegacyLabel ? '조회일 종가' : stock.recommended_at} 
                                    />
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
        Trading Intelligence System | Unified SSOT Data & Real-time Update
      </footer>
    </div>
  );
};

export default MPStockDailyReport;
