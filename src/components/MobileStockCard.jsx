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
      <span style={{ color, marginLeft: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
        {arrow} {absRate.toFixed(2)}%
      </span>
    );
  };

  const s = stock.latestSignal;
  const t2H = stock.timeframeStatus?.['2H'];
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fff' }}>{stock.name}</span>
              {stock.isTopSector && <span style={{ fontSize: '0.7rem' }}>🔥</span>}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>
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
            <div style={{ background: catBg, color: catColor, padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
              {categoryLabel}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>
              점수: <span style={{ color: '#FFD700', letterSpacing: '1px', marginLeft: '4px', marginRight: '4px' }}>{'★'.repeat(Math.round((stock.total_score || 0) / 20))}{'☆'.repeat(5 - Math.round((stock.total_score || 0) / 20))}</span> ({stock.total_score}점)
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
              세력: {Math.round(s?.adx || 0)}
            </div>
          </div>

          {/* Target Prices (Simplified for Mobile) */}
          {(t2H && t2H.ema5 > 0) && (
            <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '6px' }}>
               <div style={{ display: 'flex', flexDirection: 'column' }}>
                 <span style={{ color: '#FFD700', fontWeight: 'bold' }}>1차급등: {Math.round(t2H.ema5).toLocaleString()}</span>
                 <span style={{ color: 'var(--success)' }}>1차눌림: {Math.round(t2H.result_2).toLocaleString()}</span>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '8px' }}>
                 <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>목표: {Math.round(t2H.bb_upper).toLocaleString()}</span>
                 <span style={{ color: 'var(--success)' }}>2차눌림: {Math.round(t2H.result_3).toLocaleString()}</span>
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
          style={{ flex: 1, padding: '0.6rem', textAlign: 'center', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 'bold', textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', borderRight: '1px solid rgba(255,255,255,0.05)' }}
        >
          <ExternalLink size={14} /> 차트보기
        </a>
        <button 
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          style={{ flex: 1, padding: '0.6rem', background: 'none', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} 
          {isExpanded ? '상세 접기' : '상세 지표 수치'}
        </button>
      </div>

      {/* 3. Accordion Content (Signal Indicator) */}
      {isExpanded && s && (
        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
          <SignalIndicator signal={s} totalScore={stock.total_score} />
        </div>
      )}
    </div>
  );
};

export default MobileStockCard;
