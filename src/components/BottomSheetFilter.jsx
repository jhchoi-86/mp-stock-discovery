import React from 'react';

const BottomSheetFilter = ({
  isOpen,
  onClose,
  marketFilter,
  setMarketFilter,
  categoryFilter,
  setCategoryFilter,
  showAll,
  setShowAll,
  uploadTimeframe,
  setUploadTimeframe
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div 
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, animation: 'fadeIn 0.2s' }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', zIndex: 1001,
        borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '2rem 1.5rem',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '1.5rem',
        animation: 'slideUp 0.3s ease-out', borderTop: '1px solid var(--glass-border)'
      }}>
        <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', alignSelf: 'center', marginBottom: '-0.5rem' }} />
        
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>상세 필터 설정</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>시장 구분</label>
          <select 
            value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}
            style={{ padding: '0.8rem 1rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '8px', fontSize: '1rem' }}
          >
            <option value="ALL">전체 시장</option>
            <option value="KOSPI 200">KOSPI 200</option>
            <option value="KOSDAQ 150">KOSDAQ 150</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>카테고리</label>
          <select 
            value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '0.8rem 1rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '8px', fontSize: '1rem' }}
          >
            <option value="ALL">모든 카테고리</option>
            <option value="추천종목">⭐ 추천종목 (선택됨)</option>
            <option value="추세 지속형">추세 지속형</option>
            <option value="박스권 횡보">박스권 횡보</option>
            <option value="바닥권 반등">바닥권 반등</option>
            <option value="하락 추세">하락 추세</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--glass)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          <input 
            type="checkbox" 
            id="showAllMobile" 
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            style={{ transform: 'scale(1.2)', accentColor: 'var(--primary)' }}
          />
          <label htmlFor="showAllMobile" style={{ fontSize: '0.95rem', color: '#fff' }}>유니버스 필터링 해제 (전체 보기)</label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>가져올 시간대 기준</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
            {["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"].map(tf => (
              <button
                key={tf}
                onClick={() => setUploadTimeframe(tf)}
                style={{
                  flex: '1 1 20%', padding: '0.6rem 0', fontSize: '0.85rem', fontWeight: 'bold',
                  borderRadius: '6px', border: '1px solid var(--glass-border)',
                  background: uploadTimeframe === tf ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  color: '#fff', cursor: 'pointer'
                }}
              >
                {tf}
              </button>
            ))}
        </div>
        </div>

        <button 
          onClick={onClose}
          style={{
            marginTop: '1rem', padding: '1rem', background: 'linear-gradient(to right, var(--primary), var(--secondary))',
            border: 'none', borderRadius: '8px', color: '#fff', fontSize: '1rem', fontWeight: 'bold', width: '100%'
          }}
        >
          필터 적용 완료
        </button>
      </div>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
};

export default BottomSheetFilter;
