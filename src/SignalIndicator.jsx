import React from 'react';

const SignalIndicator = ({ signal, totalScore }) => {
  if (!signal) return null;

  const {
    cond_up7,
    DHH2,
    signal_HH,
    entry_approved,
    progress,
    adx,
    result_2,
    result_3,
    bb_upper,
    category,
    kis_change_data
  } = signal;

  // 1. 신호 강도 계산
  const getSignalStrength = () => {
    let strength = 0;
    if (cond_up7) strength += 25;
    if (DHH2) strength += 25;
    if (signal_HH) strength += 30;
    if (entry_approved) strength += 20;
    return strength;
  };

  const strength = getSignalStrength();

  let badgeColor = 'var(--text-muted)';
  let strengthLabel = '관찰';
  if (strength >= 80) {
    badgeColor = '#FF1744'; // Red
    strengthLabel = '강력 매수';
  } else if (strength >= 60) {
    badgeColor = '#FF6B35'; // Orange
    strengthLabel = '매수';
  } else if (strength >= 40) {
    badgeColor = '#4A90E2'; // Blue
    strengthLabel = '관심';
  }

  // Box styles
  const baseBoxStyle = {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
    minWidth: '60px'
  };

  const getStyle = (isActive, activeBg, activeGlow = null) => {
    if (!isActive) return { ...baseBoxStyle, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' };
    return {
      ...baseBoxStyle,
      background: activeBg,
      color: '#fff',
      boxShadow: activeGlow ? `0 0 8px ${activeGlow}, inset 0 0 1px #fff` : 'none',
      border: activeGlow ? `1px solid ${activeGlow}` : 'none'
    };
  };

  return (
    <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', borderLeft: `3px solid ${badgeColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '0.8rem', color: '#ccc' }}>PineScript 분석 데이터</span>
        <span className="badge" style={{ backgroundColor: badgeColor, color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          {totalScore !== undefined ? (
            <span style={{ color: '#FFD700', fontSize: '1.2rem', letterSpacing: '2px', textShadow: '0 0 2px rgba(0,0,0,0.8)' }} title={`${totalScore}점`}>
              {'★'.repeat(Math.round(totalScore / 20))}{'☆'.repeat(5 - Math.round(totalScore / 20))}
            </span>
          ) : `총점: ${strength}점 (${strengthLabel})`}
        </span>
      </div>

      {/* 메인 시그널 상태 (4개 박스) */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={getStyle(cond_up7, 'var(--success)')}>추세 필터<br/>(MTF MACD)</div>
        <div style={getStyle(DHH2, '#4A90E2')}>눌림목 감지<br/>(DHH2)</div>
        <div style={getStyle(entry_approved, '#F5A623')}>거래량/캔들<br/>승인</div>
        <div style={getStyle(signal_HH, '#FF1744', '#FF1744')}>최종 매수<br/>(HH)</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#aaa', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
        <div>
          <span style={{ marginRight: '8px' }}><strong style={{color: progress > 0.3 ? '#fff' : 'inherit'}}>{(progress * 100).toFixed(1)}%</strong></span>
          <span><strong style={{color: adx >= 25 ? 'var(--accent)' : 'inherit'}}>{adx > 0 ? adx.toFixed(1) : '-'}</strong></span>
        </div>
        <div>
          <span>카테고리: <strong>{category}</strong></span>
        </div>
      </div>

      {kis_change_data && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '0.75rem', 
          color: '#aaa', 
          borderTop: '1px dashed rgba(255,255,255,0.1)', 
          marginTop: '0.5rem', 
          paddingTop: '0.5rem' 
        }}>
          <div>
            <span style={{ marginRight: '12px' }}>
              거래대금(백만): <strong>{kis_change_data.trade_amount ? Number(kis_change_data.trade_amount).toLocaleString() : '-'}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>외국인: <strong style={{ color: String(kis_change_data.foreign_buy).includes('+') ? '#FF4D4D' : (String(kis_change_data.foreign_buy).includes('-') ? '#4D94FF' : '#fff') }}>{kis_change_data.foreign_buy}</strong></span>
            <span>기관: <strong style={{ color: String(kis_change_data.inst_buy).includes('+') ? '#FF4D4D' : (String(kis_change_data.inst_buy).includes('-') ? '#4D94FF' : '#fff') }}>{kis_change_data.inst_buy}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignalIndicator;
