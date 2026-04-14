import React, { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import SignalIndicator from '../SignalIndicator';
import PriceEditSection from './PriceEditSection'; // [STEP-08] 수동 편집 컴포넌트 추가

const MobileStockCard = ({ stock, index, isStrong, isAbsolute, t1H, t2H, t4H, t1D, isSyncing }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const curPrice = stock.current_price || stock.latestSignal?.current_price || stock.latestSignal?.entry_price || 0;
  
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
    const rawRate = parseFloat(kisData.rate);
    const absRate = Number.isFinite(rawRate) ? Math.abs(rawRate) : 0;
    
    if (absRate === 0 && arrow === '-') return null;

    return (
      <span style={{ color, marginLeft: '6px', fontSize: '0.8rem', fontWeight: 'normal' }}>
        {arrow} {absRate.toFixed(2)}%
      </span>
    );
  };

  const s = stock.latestSignal;
  const tfStatus = stock.timeframeStatus || {};
  const t2H_status = t2H || tfStatus['2H'];
  const t1D_status = t1D || tfStatus['1D'];
  
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
      background: 'rgba(30, 41, 59, 0.7)',
      border: `1px solid rgba(255,255,255,0.1)`,
      borderRadius: '12px',
      marginBottom: '12px',
      overflow: 'hidden',
      transition: 'all 0.2s',
      boxShadow: isHH ? '0 0 10px rgba(255, 23, 68, 0.3)' : '0 4px 6px rgba(0,0,0,0.3)',
      position: 'relative'
    }}>
      {isHH && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: '#FF1744' }} />}
      
      {/* 1. Main Info Area */}
      <div style={{ padding: '1rem 1rem 0.5rem 1rem' }}>
        {/* Header */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fff' }}>{stock.name}</span>
              {isHH && (
                <span style={{ fontSize: '0.65rem', background: '#FF1744', color: '#fff', padding: '2px 5px', borderRadius: '4px', fontWeight: 'normal' }}>
                  HH 강력신호
                </span>
              )}
              {stock.isTopSector && (
                <span style={{ fontSize: '0.65rem', background: 'var(--secondary)', color: '#fff', padding: '2px 5px', borderRadius: '4px', fontWeight: 'normal' }}>
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
            <div style={{ background: catBg, color: catColor, padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
              {categoryLabel}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
              점수: {stock.total_score}점
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
              세력: {Math.round(s?.adx || 0)}
            </div>
          </div>

          {/* Timeframe Indicators */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {["30M", "1H", "2H", "4H", "1D", "2D", "1W"].map(tf => {
              const b = stock.buy_signal_timeframes?.includes(tf);
              const s = stock.strong_signal_timeframes?.includes(tf);
              const hasSignal = b || s;
              const activeBg = s ? '#FF1744' : (b ? '#00E676' : 'rgba(255,255,255,0.1)');
              
              return (
                <div key={tf} style={{
                  padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem',
                  background: activeBg,
                  color: hasSignal ? (s ? '#fff' : '#000') : 'rgba(255,255,255,0.5)',
                  minWidth: '28px', textAlign: 'center'
                }}>
                  {tf}
                </div>
              );
            })}
          </div>

          {/* [STEP-08] 수동 편집 가능 영역 통합 */}
          <PriceEditSection
            stockCode={stock.code}
            initialPrices={{
              entry1:    stock.inst_buy_manual  ?? t2H_status?.result_2    ?? 0,
              entry2:    stock.inst_buy2_manual ?? t2H_status?.result_3    ?? 0,
              target:    stock.target_manual    ?? t2H_status?.result_1    ?? t1D_status?.bb_upper ?? 0,
              stop_loss: stock.stop_loss_manual ?? t2H_status?.stop_loss ?? (t2H_status?.result_3 > 0 ? t2H_status.result_3 * 0.98 : 0),
              is_manual: stock.is_manual_price  ?? false
            }}
          />
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
          style={{ flex: 1, padding: '0.6rem', textAlign: 'center', color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', borderRight: '1px solid rgba(255,255,255,0.05)' }}
        >
          <ExternalLink size={14} /> 차트보기
        </a>
        <button 
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          style={{ flex: 1, padding: '0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} 
          {isExpanded ? '상세 접기' : '상세 수치'}
        </button>
      </div>

      {/* 3. Accordion Content */}
      {isExpanded && stock.bestSignal && (
        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }}>
          <SignalIndicator 
            signal={stock.bestSignal} 
            latestSignal={stock.latestSignal}
            bestTfLabel={stock.bestTfLabel}
            totalScore={stock.total_score} 
            kisData={stock.kis_change_data} 
          />
        </div>
      )}
    </div>
  );
};

export default MobileStockCard;
