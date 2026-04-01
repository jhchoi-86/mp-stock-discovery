import React, { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import SignalIndicator from '../SignalIndicator';

const MobileStockCard = ({ stock, manager, isSelected, toggleSelection }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const curPrice = stock.latestSignal?.current_price || stock.latestSignal?.entry_price || 0;
  
  // Extract KIS data
  let kisData = stock.latestSignal?.kis_change_data;
  if (!kisData && stock.timeframeStatus) {
    const tfKeys = Object.keys(stock.timeframeStatus);
    for (const tf of tfKeys) {
      if (stock.timeframeStatus[tf]?.kis_change_data) {
        kisData = stock.timeframeStatus[tf].kis_change_data;
        break;
      }
    }
  }

  const renderKISChange = () => {
    if (!kisData) return null;
    const signCode = String(kisData.sign);
    const isUp = signCode === '1' || signCode === '2';
    const isDown = signCode === '4' || signCode === '5';
    const color = isUp ? '#ff4d4d' : (isDown ? '#4d94ff' : 'var(--text-muted)');
    const arrow = isUp ? '▲' : (isDown ? '▼' : '-');
    const absRate = Math.abs(parseFloat(kisData.rate));
    
    return (
      <span style={{ color, marginLeft: '6px', fontSize: '0.8rem', fontWeight: 'normal' }}>
        {arrow} {absRate.toFixed(2)}%
      </span>
    );
  };

  const s = stock.latestSignal;
  const t1H = stock.timeframeStatus?.['1H'];
  const t2H = stock.timeframeStatus?.['2H'];
  const t4H = stock.timeframeStatus?.['4H'];
  const t1D = stock.timeframeStatus?.['1D'];
  const isHH = s?.signal_HH;
  
  let categoryLabel = s ? s.category : '-';
  let catColor = 'var(--text-muted)';
  let catBg = 'rgba(255, 255, 255, 0.05)';
  
  if (s) {
    if (stock.isTopSector && categoryLabel === "추세 지속형") {
      categoryLabel = "주도주 눌림목";
      catBg = 'var(--accent)';
      catColor = '#fff';
    } else if (categoryLabel === "추세 지속형") {
      catBg = 'var(--primary)';
      catColor = '#fff';
    } else if (categoryLabel === "바닥권 반등") {
      catBg = 'var(--warning)';
      catColor = '#222';
    }
  }

  return (
    <div style={{
      background: isSelected ? 'rgba(0, 136, 204, 0.15)' : 'rgba(30, 41, 59, 0.7)',
      border: `1px solid ${isSelected ? '#0088cc' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: '12px',
      marginBottom: '12px',
      overflow: 'hidden',
      transition: 'all 0.2s',
      boxShadow: isHH ? '0 0 10px rgba(255, 23, 68, 0.3)' : '0 4px 6px rgba(0,0,0,0.3)',
      position: 'relative'
    }}>
      {isHH && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: '#FF1744' }} />}
      
      {/* 1. Main Touch Area (Toggles Checkbox) */}
      <div 
        onClick={() => toggleSelection(stock.code)}
        style={{ padding: '1rem 1rem 0.5rem 1rem', display: 'flex', gap: '12px', alignItems: 'flex-start' }}
      >
        {/* Checkbox */}
        <div style={{ paddingTop: '2px' }}>
          <div style={{ 
            width: '22px', height: '22px', borderRadius: '6px', 
            border: `2px solid ${isSelected ? '#0088cc' : 'rgba(255,255,255,0.4)'}`,
            background: isSelected ? '#0088cc' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s'
          }}>
            {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fff' }}>{stock.name}</span>
              {isHH && (
                <span title="고점 돌파 강력 신호" style={{ fontSize: '0.65rem', background: '#FF1744', color: '#fff', padding: '2px 5px', borderRadius: '4px', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
                  HH 강력신호
                </span>
              )}
              {stock.isTopSector && (
                <span title="HH 신호 밀집(주도 섹터)" style={{ fontSize: '0.65rem', background: 'var(--secondary)', color: '#fff', padding: '2px 5px', borderRadius: '4px', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
                  🔥 주도섹터
                </span>
              )}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'normal', color: '#fff' }}>
              {curPrice > 0 ? Math.round(curPrice).toLocaleString() : '-'}원
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {stock.market} | {stock.code}
            </span>
            {renderKISChange()}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div style={{ background: catBg, color: catColor, padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'normal' }}>
              {categoryLabel}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>
              점수: <span style={{ display: 'inline-block', position: 'relative', letterSpacing: '1px', marginLeft: '4px', marginRight: '4px', color: 'rgba(255,255,255,0.2)' }}>
                ★★★★★
                <span style={{ position: 'absolute', top: 0, left: 0, height: '100%', overflow: 'hidden', width: `${stock.total_score || 0}%`, color: '#FFD700', whiteSpace: 'nowrap' }}>
                  ★★★★★
                </span>
              </span> ({stock.total_score}점)
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
              세력: {Math.round(s?.adx || 0)}
            </div>
          </div>

          {/* [Design v3.0] 타임프레임 신호 인디케이터 (Mobile) */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {["30M", "1H", "2H", "4H", "1D", "2D", "1W"].map(tf => {
              const isBuy = stock.buy_signal_timeframes?.includes(tf);
              const isStrong = stock.strong_signal_timeframes?.includes(tf);
              const isTrend = stock.trend_signal_timeframes?.includes(tf);
              const hasSignal = isBuy || isStrong;
              const activeBg = isStrong ? '#FF1744' : (isBuy ? '#00E676' : 'rgba(255,255,255,0.1)');
              
              return (
                <div key={tf} style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.65rem',
                  background: activeBg,
                  border: isTrend ? '1px solid #4A90E2' : (hasSignal ? `1px solid ${activeBg}` : '1px solid rgba(255,255,255,0.15)'),
                  color: hasSignal ? (isStrong ? '#fff' : '#000') : 'rgba(255,255,255,0.5)',
                  fontWeight: isTrend ? 'bold' : 'normal',
                  minWidth: '28px',
                  textAlign: 'center'
                }}>
                  {tf}
                </div>
              );
            })}
          </div>

          {/* [Design v3.0] 2H 이평 정렬 데이터 렌더링 (Refined) */}
          {stock.t2H && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: '#fff', background: 'rgba(255,193,7,0.08)', padding: '10px', borderRadius: '10px', marginBottom: '8px', border: '1px solid rgba(255,193,7,0.25)' }}>
              <div style={{ fontWeight: 'bold', color: '#ffc107', marginBottom: '4px', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,193,7,0.2)', paddingBottom: '4px' }}>2H 이평선 정렬 💡</div>
              {(() => {
                const mas = Object.entries(stock.t2H)
                  .filter(([, v]) => v !== null)
                  .sort(([, a], [, b]) => b - a);
                const elements = [];
                let priceInserted = false;
                const cur = stock.latestSignal?.current_price || stock.latestSignal?.entry_price || 0;
                
                if (cur > mas[0][1]) {
                  elements.push(<div key="cur" style={{ color: 'var(--accent)', fontWeight: 'bold', padding: '2px 0' }}>📍 현재가: {Math.round(cur).toLocaleString()}원</div>);
                  priceInserted = true;
                }
                mas.forEach(([name, price], midx) => {
                  elements.push(
                    <div key={name} style={{ opacity: 0.9, padding: '2px 0', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{name.toUpperCase()}:</span>
                      <span>{Math.round(price).toLocaleString()}원</span>
                    </div>
                  );
                  const nextPrice = mas[midx + 1]?.[1] || 0;
                  if (!priceInserted && cur <= price && cur > nextPrice) {
                    elements.push(<div key="cur" style={{ color: 'var(--accent)', fontWeight: 'bold', padding: '2px 0' }}>📍 현재가: {Math.round(cur).toLocaleString()}원</div>);
                    priceInserted = true;
                  }
                });
                if (!priceInserted && cur > 0) {
                  elements.push(<div key="cur" style={{ color: 'var(--accent)', fontWeight: 'bold', padding: '2px 0' }}>📍 현재가: {Math.round(cur).toLocaleString()}원</div>);
                }
                return elements;
              })()}
            </div>
          )}

          {/* Target Prices (Simplified for Mobile) */}
          {(t1H?.result_2 > 0 || t2H?.result_2 > 0 || t4H?.result_2 > 0 || t1D?.bb_upper > 0) && (
            <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '6px' }}>
               <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                 {t1H?.result_2 > 0 && (
                   <span style={{ color: '#FFD700', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
                     1차 진입(1H): {Math.round(t1H.result_2).toLocaleString()}
                     {stock.close > 0 && (
                       <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: t1H.result_2 >= stock.close ? '#ff6b6b' : '#339af0' }}>
                         ({((t1H.result_2 - stock.close) / stock.close * 100).toFixed(1)}%)
                       </span>
                     )}
                   </span>
                 )}
                 {t1D?.bb_upper > 0 && (
                   <span style={{ color: 'var(--accent)', fontWeight: 'normal', whiteSpace: 'nowrap', marginTop: '4px' }}>
                     목표(1D): {Math.round(t1D.bb_upper).toLocaleString()}
                   </span>
                 )}
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '8px' }}>
                 {t2H?.result_2 > 0 && (
                   <span style={{ color: 'var(--success)', whiteSpace: 'nowrap' }}>
                     2차 진입(2H): {Math.round(t2H.result_2).toLocaleString()}
                     {stock.close > 0 && (
                       <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: t2H.result_2 >= stock.close ? '#ff6b6b' : '#339af0' }}>
                         ({((t2H.result_2 - stock.close) / stock.close * 100).toFixed(1)}%)
                       </span>
                     )}
                   </span>
                 )}
                 {t4H?.result_2 > 0 && (
                   <span style={{ color: 'var(--success)', whiteSpace: 'nowrap', marginTop: '4px' }}>
                     3차 진입(4H): {Math.round(t4H.result_2).toLocaleString()}
                     {stock.close > 0 && (
                       <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: t4H.result_2 >= stock.close ? '#ff6b6b' : '#339af0' }}>
                         ({((t4H.result_2 - stock.close) / stock.close * 100).toFixed(1)}%)
                       </span>
                     )}
                   </span>
                 )}
               </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Actions / Accordion Toggle */}
      <div style={{ 
        display: 'flex', borderTop: '1px solid rgba(255,255,255,0.05)', 
        background: 'rgba(0,0,0,0.15)'
      }}>
        <a 
          href={`https://kr.tradingview.com/chart/?symbol=KRX:${stock.code}`}
          target="_blank" rel="noopener noreferrer"
          style={{ flex: 1, padding: '0.6rem', textAlign: 'center', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 'normal', textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', borderRight: '1px solid rgba(255,255,255,0.05)' }}
        >
          <ExternalLink size={14} /> 차트보기
        </a>
        <button 
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          style={{ flex: 1, padding: '0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 'normal', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} 
          {isExpanded ? '상세 접기' : '상세 지표 수치'}
        </button>
      </div>

      {/* 3. Accordion Content (Signal Indicator) */}
      {isExpanded && stock.bestSignal && (
        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
          <SignalIndicator 
            signal={stock.bestSignal} 
            latestSignal={stock.latestSignal}
            bestTfLabel={stock.bestTfLabel}
            totalScore={stock.total_score} 
            kisData={kisData} 
          />
        </div>
      )}
    </div>
  );
};

export default MobileStockCard;
