import React, { useState, useRef } from 'react';
import { LineChart, LayoutDashboard, Share2, ExternalLink, Activity, Upload, RotateCcw, RefreshCw, Trash2, Power, LogOut, UserCog, Archive } from 'lucide-react';
import SignalIndicator from '../SignalIndicator';
import AdminDashboard from './AdminDashboard.jsx';
import UserProfile from './UserProfile.jsx';
import RoiRankingWidget from './RoiRankingWidget.jsx';
import ReportArchive from './ReportArchive.jsx';
import SubscriptionModal from './SubscriptionModal.jsx';

const PcDashboard = ({ manager, user, clearAuth }) => {
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isReportArchiveOpen, setIsReportArchiveOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const fileInputRef = useRef(null);

  const {
      stocks, signals, lastUpdate,
      searchQuery, setSearchQuery,
      marketFilter, setMarketFilter,
      categoryFilter, setCategoryFilter,
      showAll, setShowAll,
      uploadTimeframe, setUploadTimeframe,
      selectedStocks, toggleSelectAll, toggleSelectStock,
      isSyncing, isSendingTg, 
      candidates, topSectors, activeCount, 
      handleCsvUpload, handleReset, handleAutoSync,
      handleDownloadReport, handleDownloadTVList, handleSendToTelegram
  } = manager;

  return (
    <div className="container">
      <header className="fade-in">
        <div className="logo-section" style={{ minWidth: '300px', flex: '1 1 auto' }}>
          <h1 style={{ lineHeight: '1.4', fontSize: '1.7rem', fontWeight: '800' }}>
            MP KOSPI 200, KOSDAQ 150 우량주<br/>
            <span style={{ color: 'var(--accent)' }}>매수 추천 종목 리서치</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '6px' }}>정리 시스템 (전체 350개 종목)</p>
        </div>
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-label" style={{ whiteSpace: 'nowrap' }}>시스템 상태</div>
            <div className="stat-value" style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
              <div className="pulse-dot"></div>
              실시간 가동중
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">수신 신호</div>
            <div className="stat-value">{signals.length}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">강력 신호 (HH)</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{activeCount}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label" style={{ whiteSpace: 'nowrap' }}>🔥 주도 섹터 (HH 밀집)</div>
            <div className="stat-value" style={{ fontSize: '0.85rem', color: 'var(--secondary)', whiteSpace: 'nowrap' }}>
              {topSectors.length > 0 ? topSectors.join(' · ') : '분석중'}
            </div>
          </div>
          {isSyncing && (
            <div className="stat-item" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '1rem' }}>
              <div className="stat-label" style={{ whiteSpace: 'nowrap' }}>진행중</div>
              <div className="stat-value" style={{ color: 'var(--primary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                전종목 분석중...
              </div>
            </div>
          )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingLeft: '1.5rem', borderLeft: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            onClick={() => setIsProfileOpen(true)}
            style={{ textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', padding: '0.2rem 0.5rem', borderRadius: '4px', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.05)' } }}
          >
            <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{user?.name || user?.email?.split('@')[0]}</div>
            <div style={{ 
              fontSize: '0.65rem', 
              color: user?.role === 'ADMIN' ? '#e74c3c' : (user?.role === 'PAID' ? '#f1c40f' : '#bdc3c7'),
              background: 'rgba(255,255,255,0.1)',
              padding: '2px 6px',
              borderRadius: '12px',
              display: 'inline-block',
              marginTop: '4px'
            }}>
              {user?.role?.replace('_USER', '')}
            </div>
          </button>
          <UserProfile isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
          <button 
            onClick={() => setIsSubscriptionOpen(true)}
            className="action-btn"
            style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', background: 'linear-gradient(to right, var(--primary), var(--secondary))', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 700, transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)' }}
            title="프리미엄 구독"
          >
            👑 프리미엄
          </button>
          <SubscriptionModal isOpen={isSubscriptionOpen} onClose={() => setIsSubscriptionOpen(false)} />
          {user?.role === 'ADMIN' && (
            <button 
              onClick={() => setShowAdminPanel(!showAdminPanel)} 
              className="action-btn"
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', background: showAdminPanel ? 'var(--primary)' : 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500, transition: 'all 0.2s' }}
              title="관리자 패널 토글"
            >
              <UserCog size={18} /> {showAdminPanel ? '신호 대시보드' : '관리자 패널'}
            </button>
          )}
          {['ADMIN', 'PAID'].includes(user?.role) && (
            <button 
              onClick={() => setIsReportArchiveOpen(true)} 
              className="action-btn"
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500, transition: 'all 0.2s' }}
              title="VIP 자료실"
            >
              <Archive size={18} /> VIP 자료실
            </button>
          )}
          <ReportArchive isOpen={isReportArchiveOpen} onClose={() => setIsReportArchiveOpen(false)} />
          <button 
            onClick={clearAuth} 
            className="action-btn"
            style={{ padding: '0.6rem', borderRadius: '8px', background: 'rgba(231, 76, 60, 0.15)', color: '#e74c3c', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(231, 76, 60, 0.3)', transition: 'all 0.2s' }}
            title="로그아웃"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>

      {showAdminPanel && user?.role === 'ADMIN' ? (
        <AdminDashboard />
      ) : (
        <>
      <RoiRankingWidget />
      <div className="controls fade-in" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="종목명/코드 검색..." 
          className="card"
          style={{ padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff', minWidth: '200px', flex: 1 }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select 
          className="card"
          style={{ padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value)}
        >
          <option value="ALL">전체 시장</option>
          <option value="KOSPI 200">KOSPI 200</option>
          <option value="KOSDAQ 150">KOSDAQ 150</option>
        </select>

        <select 
          className="card"
          style={{ padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="ALL">모든 카테고리</option>
          <option value="추세 지속형">추세 지속형</option>
          <option value="바닥권 반등">바닥권 반등</option>
          <option value="박스권 횡보">박스권 횡보</option>
          <option value="추천종목">⭐ 수동 관심종목</option>
        </select>
        


        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', color: '#fff' }}>
          <input 
            type="checkbox" 
            id="showAllToggle" 
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '16px', height: '16px' }}
          />
          <label htmlFor="showAllToggle" style={{ cursor: 'pointer', userSelect: 'none' }}>
            {showAll ? '유니버스 전체보기 (점수정렬)' : '🌟 자동 추천 (점수별 Top 10)'}
          </label>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>가져올 시간대:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
            {["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"].map(tf => (
              <button
                key={tf}
                onClick={() => setUploadTimeframe(tf)}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: uploadTimeframe === tf ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

        <input 
          type="file" 
          accept=".csv" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={(e) => { handleCsvUpload(e.target.files[0]); if(fileInputRef.current) fileInputRef.current.value=""; }}
        />
        
        {/* === Control Panel === */}
        {(user?.role === 'ADMIN' || user?.role === 'PAID') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <button 
              onClick={handleAutoSync}
              disabled={isSyncing}
              className="card" 
              style={{ padding: '0.75rem 1.5rem', background: isSyncing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(to right, #6366f1, #a855f7)', border: 'none', color: '#fff', cursor: isSyncing ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Activity size={18} className={isSyncing ? "spin" : ""} /> {isSyncing ? "분석중..." : "전종목 자동 동기화"}
            </button>
          </div>
        )}
        
        {user?.role === 'ADMIN' && (
          <button 
            onClick={handleReset}
            className="card" 
            style={{ padding: '0.75rem 1.5rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#f87171', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RotateCcw size={18} /> 초기화 리셋
          </button>
        )}
        
        {selectedStocks.size > 0 && (
          <button 
            onClick={() => setSelectedStocks(new Set())}
            className="card" 
            style={{ padding: '0.75rem 1.5rem', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            선택 전체 해제 ({selectedStocks.size})
          </button>
        )}
        
        <button 
          onClick={handleDownloadReport}
          className="card" 
          style={{ padding: '0.75rem 1.5rem', background: 'linear-gradient(to right, var(--primary), var(--secondary))', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Share2 size={18} /> 리포트 다운로드
        </button>
        <button 
          onClick={handleDownloadTVList}
          className="card" 
          style={{ padding: '0.75rem 1.5rem', background: '#2962FF', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          title="트레이딩뷰 Watchlist Import용 TXT 파일 다운로드 (50점 이상)"
        >
          <ExternalLink size={18} /> 트래이딩뷰 추천 종목코드 다운로드
        </button>
        {user?.role === 'ADMIN' && (
          <button 
            onClick={handleSendToTelegram}
            disabled={isSendingTg}
            className="card" 
            style={{ padding: '0.75rem 1.5rem', background: isSendingTg ? 'rgba(255,255,255,0.05)' : '#0088cc', border: 'none', color: '#fff', cursor: isSendingTg ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Share2 size={18} className={isSendingTg ? "spin" : ""} /> {isSendingTg ? "전송중..." : "텔레그램 발송"}
          </button>
        )}
      </div>

      <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="table-container" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)' }}>
              <tr>
                <th style={{ minWidth: '30px', textAlign: 'center', padding: '0.4rem 0.2rem' }}>
                  <input type="checkbox" onChange={toggleSelectAll} checked={candidates.length > 0 && selectedStocks.size === candidates.length} />
                </th>
                <th style={{ minWidth: '60px', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>종목명</th>
                <th style={{ minWidth: '45px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>세력강도</th>
                <th style={{ minWidth: '35px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>점수</th>
                <th style={{ minWidth: '60px', fontSize: '0.75rem', textAlign: 'center', padding: '0.4rem 0.2rem' }} title="추천 보호를 위한 권장 손절 기준: -10% 미만 이탈 시 즉각 대응">지지저항대 💡</th>
                <th style={{ minWidth: '70px', fontSize: '0.75rem', textAlign: 'center', padding: '0.4rem 0.2rem' }}>매수신호<br/>발생</th>
                <th style={{ minWidth: '35px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>추세</th>

                <th style={{ minWidth: '95px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>추천매매<br/><span style={{fontSize:'0.65rem'}}>(분할매수전략)</span></th>
                <th style={{ minWidth: '40px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#fff' }}>
                      {searchQuery ? "검색 결과가 없습니다." : "사용 방법: 1. 가져올 시간대를 선택 👉 2. 전종목 자동 동기화 실행"}
                    </div>
                    {!searchQuery && (
                      <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-muted)' }}>
                        시스템이 <strong>TradingView의 Webhook 신호</strong>를 실시간으로 대기 중이거나 실시간 분석을 진행합니다.<br/>
                        (현재 모니터링 대상 KOSPI/KOSDAQ 우량주: 총 <strong>350개</strong> 종목)
                      </div>
                    )}
                  </td>
                </tr>

              ) : (
                candidates.map((stock, idx) => {
                  let categoryLabel = stock.latestSignal ? stock.latestSignal.category : '-';
                  let catColor = 'var(--text-muted)';
                  let catBg = 'rgba(255, 255, 255, 0.05)';
                  
                  if (stock.latestSignal) {
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
                    } else if (categoryLabel === "박스권 횡보") {
                       // default muted
                    }
                  }

                  const s = stock.latestSignal;
                  const t1H = stock.timeframeStatus['1H'];
                  const t2H = stock.timeframeStatus['2H'];
                  const t1D = stock.timeframeStatus['1D'];
                  
                  const curPrice = s?.current_price || s?.entry_price || 0;
                  
                  // KIS data might be attached to a specific synced timeframe (like 1D) rather than the latest webhook signal
                  let kisData = s?.kis_change_data;
                  if (!kisData) {
                    const tfKeys = Object.keys(stock.timeframeStatus);
                    for (const tf of tfKeys) {
                      if (stock.timeframeStatus[tf]?.kis_change_data) {
                        kisData = stock.timeframeStatus[tf].kis_change_data;
                        break;
                      }
                    }
                  }
                  
                  // Extract Daily Open and Prev Close, prioritizing highly-accurate KIS reversed daily closure
                  let truePrevClose = 0;
                  if (kisData && curPrice > 0) {
                    const signCode = String(kisData.sign);
                    const isUp = signCode === '1' || signCode === '2';
                    const isDown = signCode === '4' || signCode === '5';
                    const directionalChange = isUp ? kisData.change : (isDown ? -kisData.change : 0);
                    truePrevClose = curPrice - directionalChange;
                  }
                  const dailyPrevClose = truePrevClose > 0 ? truePrevClose : (t1D?.prev_close || s?.prev_close || 0);
                  const dailyOpen = t1D?.open_price || s?.open_price || 0;
                  
                  // Helper to format percentage with triangle
                  const renderChange = (current, base) => {
                    if (!current || !base) return null;
                    const pct = ((current - base) / base) * 100;
                    if (Math.abs(pct) < 0.01) return <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>0.00%</span>;
                    const isUp = pct > 0;
                    const color = isUp ? '#ff4d4d' : '#4d94ff';
                    const arrow = isUp ? '▲' : '▼';
                    return <span style={{ color, marginLeft: '4px', fontSize: '0.65rem' }}>{arrow} {Math.abs(pct).toFixed(2)}%</span>;
                  };

                  const renderProfitRate = (target, entry) => {
                    if (!target || !entry) return null;
                    // For the recommended entry points, we want to show the potential upside/downside profit rate
                    // Formula: (Target Price - Entry Price) / Entry Price * 100
                    const pct = ((target - entry) / entry) * 100;
                    if (Math.abs(pct) < 0.01) return <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>0.00%</span>;
                    
                    const isUp = pct > 0;
                    const color = isUp ? '#ff4d4d' : '#4d94ff'; 
                    const arrow = isUp ? '▲' : '▼'; 
                    return <span style={{ color, marginLeft: '4px', fontSize: '0.65rem' }}>{arrow} {Math.abs(pct).toFixed(2)}%</span>;
                  };

                  const renderKISChange = (currentPrice, fallbackBase, kisInfo) => {
                    if (kisInfo) {
                      const signCode = String(kisInfo.sign);
                      const isUp = signCode === '1' || signCode === '2';
                      const isDown = signCode === '4' || signCode === '5';
                      const color = isUp ? '#ff4d4d' : (isDown ? '#4d94ff' : 'var(--text-muted)');
                      const arrow = isUp ? '▲' : (isDown ? '▼' : '-');
                      const absRate = Math.abs(parseFloat(kisInfo.rate));
                      return (
                        <span style={{ color, marginLeft: '4px', fontSize: '0.65rem' }}>
                          {arrow} {absRate.toFixed(2)}%
                        </span>
                      );
                    }
                    // Fallback if KIS data missing
                    return fallbackBase > 0 ? renderChange(currentPrice, fallbackBase) : null;
                  };

                  return (
                  <React.Fragment key={stock.code}>
                  <tr className="fade-in" style={{ animationDelay: `${idx < 15 ? 0.1 + idx * 0.05 : 0}s`, background: stock.latestSignal && stock.latestSignal.signal_HH ? 'rgba(255, 23, 68, 0.1)' : 'transparent', borderLeft: stock.latestSignal && stock.latestSignal.signal_HH ? '3px solid #FF1744' : '3px solid transparent' }}>
                    <td style={{ textAlign: 'center', padding: '0.4rem 0.2rem' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedStocks.has(stock.code)} 
                        onChange={() => toggleSelectStock(stock.code)} 
                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      <div className="stock-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="stock-name" style={{ fontSize: '0.95rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{stock.name}</span>
                          {stock.latestSignal && stock.latestSignal.signal_HH && (
                            <span title="고점 돌파 강력 신호" style={{ fontSize: '0.65rem', background: '#FF1744', color: '#fff', padding: '2px 5px', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              HH 강력신호
                            </span>
                          )}
                          {stock.isTopSector && (
                            <span title="HH 신호 밀집(주도 섹터)" style={{ fontSize: '0.65rem', background: 'var(--secondary)', color: '#fff', padding: '2px 5px', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              🔥 주도섹터
                            </span>
                          )}
                        </div>
                        <span className="stock-code" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {stock.market} | {stock.code} {stock.sector && stock.sector !== '기타' ? `| ${stock.sector}` : ''}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
                       {stock.latestSignal ? (
                          <>
                            <div style={{ background: catBg, color: catColor, padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.65rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {categoryLabel}
                            </div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                              {Math.round(stock.latestSignal.adx || 0)}
                            </div>
                          </>
                       ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                       )}
                       </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <div style={{ display: 'inline-block', position: 'relative', fontSize: '1.1rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.2)' }}>
                          ★★★★★
                          <div style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden', width: `${stock.total_score || 0}%`, color: '#FFD700', whiteSpace: 'nowrap', textShadow: '0 0 2px rgba(0,0,0,0.5)' }}>
                            ★★★★★
                          </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                          {stock.total_score}점
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      {stock.latestSignal ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <span className="badge badge-primary" style={{ fontSize: '0.65rem' }} title="2시간봉(2H) RSI 패턴 기준 1차 지지선">
                            1차지지: {t2H && t2H.result_2 > 0 ? `${Math.round(t2H.result_2).toLocaleString()}원` : '-'}
                            {curPrice > 0 && t2H && t2H.result_2 > 0 ? renderChange(t2H.result_2, curPrice) : null}
                          </span>
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem' }} title="2시간봉(2H) RSI 패턴 기준 2차 지지선">
                            2차지지: {t2H && t2H.result_3 > 0 ? `${Math.round(t2H.result_3).toLocaleString()}원` : '-'}
                            {curPrice > 0 && t2H && t2H.result_3 > 0 ? renderChange(t2H.result_3, curPrice) : null}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>데이터 대기중</span>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                          {["5M", "15M", "30M"].map(tf => {
                            const sig = stock.timeframeStatus[tf];
                            const hasSignal = sig && sig.DHH2;
                            const isHH = sig && sig.signal_HH;
                            return (
                              <div 
                                key={tf}
                                style={{
                                  width: '26px',
                                  height: '20px',
                                  borderRadius: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.55rem',
                                  fontWeight: 'bold',
                                  background: isHH ? '#FF1744' : (hasSignal ? '#00E676' : 'rgba(255,255,255,0.1)'),
                                  border: hasSignal ? `1px solid ${isHH ? '#FF1744' : '#00E676'}` : '1px solid rgba(255,255,255,0.15)',
                                  color: hasSignal ? (hasSignal && !isHH ? '#000' : '#fff') : 'rgba(255,255,255,0.5)'
                                }}
                                title={sig ? `${tf} 신호 - 진행률: ${(sig.progress * 100).toFixed(1)}%` : `${tf} 데이터 없음`}
                              >
                                {tf}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                          {["1H", "2H", "4H", "1D", "1W"].map(tf => {
                            const sig = stock.timeframeStatus[tf];
                            const hasSignal = sig && sig.DHH2;
                            const isHH = sig && sig.signal_HH;
                            return (
                              <div 
                                key={tf}
                                style={{
                                  width: '26px',
                                  height: '20px',
                                  borderRadius: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.55rem',
                                  fontWeight: 'bold',
                                  background: isHH ? '#FF1744' : (hasSignal ? '#00E676' : 'rgba(255,255,255,0.1)'),
                                  border: hasSignal ? `1px solid ${isHH ? '#FF1744' : '#00E676'}` : '1px solid rgba(255,255,255,0.15)',
                                  color: hasSignal ? (hasSignal && !isHH ? '#000' : '#fff') : 'rgba(255,255,255,0.5)'
                                }}
                                title={sig ? `${tf} 신호 - 진행률: ${(sig.progress * 100).toFixed(1)}%` : `${tf} 데이터 없음`}
                              >
                                {tf}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '0.4rem 0.2rem' }}>
                      {stock.latestSignal?.cond_up7 ? (
                        <div style={{ background: '#2563EB', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.75rem', display: 'inline-block', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>상승</div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>


                    <td style={{ textAlign: 'right', padding: '0.4rem 0.2rem', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem' }}>
                        {(() => {
                          const targetData = (t2H && t2H.ema5 > 0) ? t2H : (t1D && t1D.ema5 > 0 ? t1D : null);
                          const tfLabel = (t2H && t2H.ema5 > 0) ? "2H" : "1D";
                          const targetPrice = targetData && targetData.bb_upper > 0 ? targetData.bb_upper : 0;
                          const signalTime = s?.timestamp ? new Date(s.timestamp).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
                          
                          if (targetData) {
                            return (
                              <>
                                <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', paddingBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                  현재가: {curPrice > 0 ? Math.round(curPrice).toLocaleString() : '-'}원
                                  {renderKISChange(curPrice, dailyPrevClose, kisData)}
                                  {signalTime && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>({signalTime})</span>}
                                </span>
                                <span style={{ color: '#FFD700', fontWeight: 'bold' }}>
                                  돌파 매수타점: {Math.round(targetData.ema5).toLocaleString()}원
                                  {curPrice > 0 && targetData.ema5 > 0 ? (
                                    <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: targetData.ema5 >= curPrice ? '#ff6b6b' : '#339af0' }}>
                                      ({targetData.ema5 > curPrice ? '+' : ''}{(Math.round(targetData.ema5 - curPrice)).toLocaleString()}원, {((targetData.ema5 - curPrice) / curPrice * 100).toFixed(2)}%)
                                    </span>
                                  ) : null}
                                </span>
                                <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                  1차 매수타점: {targetData.result_2 > 0 ? Math.round(targetData.result_2).toLocaleString() : '-'}원
                                  {curPrice > 0 && targetData.result_2 > 0 ? (
                                    <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: targetData.result_2 >= curPrice ? '#ff6b6b' : '#339af0' }}>
                                      ({targetData.result_2 > curPrice ? '+' : ''}{(Math.round(targetData.result_2 - curPrice)).toLocaleString()}원, {((targetData.result_2 - curPrice) / curPrice * 100).toFixed(2)}%)
                                    </span>
                                  ) : null}
                                </span>
                                <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                  2차 매수타점: {targetData.result_3 > 0 ? Math.round(targetData.result_3).toLocaleString() : '-'}원
                                  {curPrice > 0 && targetData.result_3 > 0 ? (
                                    <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: targetData.result_3 >= curPrice ? '#ff6b6b' : '#339af0' }}>
                                      ({targetData.result_3 > curPrice ? '+' : ''}{(Math.round(targetData.result_3 - curPrice)).toLocaleString()}원, {((targetData.result_3 - curPrice) / curPrice * 100).toFixed(2)}%)
                                    </span>
                                  ) : null}
                                </span>
                                <span style={{ color: 'var(--accent)', fontWeight: 'bold', marginTop: '2px' }}>
                                  1차목표가({tfLabel}): {targetPrice > 0 ? Math.round(targetPrice).toLocaleString() : '-'}원
                                  {targetPrice > 0 && dailyPrevClose > 0 ? renderChange(targetPrice, dailyPrevClose) : null}
                                </span>
                              </>
                            );
                          } else {
                            return (
                              <>
                                <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', paddingBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                  현재가: {curPrice > 0 ? Math.round(curPrice).toLocaleString() : '-'}원
                                  {renderKISChange(curPrice, dailyPrevClose, kisData)}
                                  {signalTime && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>({signalTime})</span>}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  타점: {s ? Math.round(s.entry_price || s.result_2).toLocaleString() : '-'}원
                                </span>
                              </>
                            );
                          }
                        })()}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <a 
                        href={`https://www.tradingview.com/chart/?symbol=KRX:${stock.code}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="tv-link"
                        style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                      >
                        <ExternalLink size={14} /> 차트
                      </a>
                    </td>
                  </tr>
                  {stock.latestSignal && (
                    <tr key={`${stock.code}-indicator`} style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <td colSpan="9" style={{ padding: '0 1rem 1rem 1rem', borderTop: 'none' }}>
                        <SignalIndicator signal={stock.latestSignal} totalScore={stock.total_score} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>
        </>
      )}

      {/* Copyright Footer */}
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 'auto' }}>
        <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: '#ffb86c' }}>⚠️ 본 서비스는 자동 매매가 아닙니다. 모든 투자 판단 및 손실에 대한 책임은 투자자 본인에게 있습니다.</p>
        <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>© 2026 MP Stock. All rights reserved.</p>
        <p style={{ margin: 0, opacity: 0.7 }}>본 프로그램의 소유권은 MP Stock에 있으며 무단 복제 및 수정을 금합니다.</p>
      </div>
    </div>
  );
};

export default PcDashboard;
