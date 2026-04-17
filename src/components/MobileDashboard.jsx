import React, { useState } from 'react';
import MobileStockCard from './MobileStockCard.jsx';
import SyncProgressHeader from './SyncProgressHeader.jsx';
import SignalNotificationWatcher from './SignalNotificationWatcher.jsx';
import UserProfile from './UserProfile.jsx';
import SubscriptionModal from './SubscriptionModal.jsx';
import ReportArchive from './ReportArchive.jsx';
import reportService from '../api/reportService';
import useSWR from 'swr';
import { useSSE } from '../hooks/useSSE';
import { Activity, Archive, Share2, Filter, Layout, LogOut, UserCog, Search, X, Settings } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import AdminDashboard from './AdminDashboard.jsx';
import BottomSheetFilter from './BottomSheetFilter.jsx';
import PppWatchlist from './PppWatchlist.jsx';

// KST 기준 장중 상태 판별
function getMarketStatus() {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day   = kstNow.getUTCDay();
  const t     = kstNow.getUTCHours() * 100 + kstNow.getUTCMinutes();
  if (day === 0 || day === 6) return 'closed';
  if (t >= 900  && t < 1530) return 'live';
  if (t >= 1530 && t <= 2000) return 'afterhours';
  return 'closed';
}

const MobileDashboard = ({ manager, user, clearAuth }) => {
  const { realtimePrices } = useSSE();
  const [landingTab, setLandingTab] = useState('MP_SIGNAL'); // 'HOME', 'MP_SIGNAL', 'DAILY_PERFORMANCE'
  const {
      searchQuery, setSearchQuery,
      marketFilter, setMarketFilter,
      categoryFilter, setCategoryFilter,
      showAll, setShowAll,
      uploadTimeframe, setUploadTimeframe,
      isSyncing, isSendingTg,
      candidates: originalCandidates, topSectors, activeCount, signalsSummary, selectedStocks,
      handleIntegratedSync, handleSendToTelegram,
      toggleSelectStock, toggleSelectAll,
      fetchData
  } = manager;

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isReportArchiveOpen, setIsReportArchiveOpen] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);

  const { data: reportData, isLoading: isReportLoading } = useSWR('reports/latest', reportService.getLatestReport, {
    revalidateOnFocus: true,
    refreshInterval: 3000
  });

  const marketStatus = getMarketStatus();

  // Merge Real-time Prices (v3.7.6 / v8.8.21)
  const candidates = React.useMemo(() => {
    return (originalCandidates || []).map(stock => {
        const rt = realtimePrices[stock.code];
        if (marketStatus === 'live' && rt) {
            return {
                ...stock,
                current_price: rt.price,
                change_rate: rt.changeRate
            };
        }
        return stock;
    });
  }, [originalCandidates, realtimePrices, marketStatus]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: '#fff' }}>
      {/* 1. Sticky Top Navigation */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--glass-border)', padding: '0.5rem 1rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, background: 'linear-gradient(to right, var(--primary), var(--secondary))', WebkitBackgroundClip: 'text', color: 'transparent' }}>
                    MP STOCK
                </h1>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>v{__APP_VERSION__}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => setIsProfileOpen(true)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {user?.name || user?.email?.split('@')[0]}
                </button>
            </div>
        </div>

        <nav style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '3px', borderRadius: '10px', width: '100%' }}>
            <button 
              onClick={() => { setLandingTab('HOME'); setShowAdminPanel(false); }}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '7px', border: 'none', background: landingTab === 'HOME' ? 'var(--primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.2s' }}
            >
              Home
            </button>
            <button 
              onClick={() => { setLandingTab('MP_SIGNAL'); setShowAdminPanel(false); }}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '7px', border: 'none', background: landingTab === 'MP_SIGNAL' ? 'var(--primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.2s' }}
            >
              MP 시그널
            </button>
            {['PAID', 'PRO_USER', 'ADMIN'].includes(user?.role) && (
              <button 
                onClick={() => { setLandingTab('PPP'); setShowAdminPanel(false); }}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '7px', border: 'none', background: landingTab === 'PPP' ? 'var(--primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.2s' }}
              >
                PPP
              </button>
            )}
          </nav>
      </header>
      
      {/* User Profile Modal Map */}
      <UserProfile isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <ReportArchive isOpen={isReportArchiveOpen} onClose={() => setIsReportArchiveOpen(false)} />
      <SubscriptionModal isOpen={isSubscriptionOpen} onClose={() => setIsSubscriptionOpen(false)} />
      <SignalNotificationWatcher />

      {/* Quick Action Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.75rem 1rem', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <button onClick={() => setIsSubscriptionOpen(true)} style={{ flexShrink: 0, padding: '0.5rem 0.8rem', background: 'linear-gradient(to right, var(--primary), var(--secondary))', border: 'none', color: '#fff', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(236,72,153,0.3)' }}>
          👑 프리미엄
        </button>
        {['ADMIN', 'PAID'].includes(user?.role) && (
          <>
            <button onClick={() => handleIntegratedSync()} disabled={isSyncing} style={{ flexShrink: 0, padding: '0.5rem 0.8rem', background: isSyncing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(to right, #10b981, #059669)', border: 'none', color: '#fff', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: isSyncing ? 'not-allowed' : 'pointer', boxShadow: isSyncing ? 'none' : '0 4px 12px rgba(16,185,129,0.3)' }}>
              <Activity size={14} className={isSyncing ? "spin" : ""} /> {isSyncing ? '진행중...' : '통합 분석'}
            </button>
          </>
        )}

        {selectedStocks.size > 0 && (
          <button onClick={() => setSelectedStocks(new Set())} style={{ flexShrink: 0, padding: '0.5rem 0.8rem', background: 'rgba(255,100,100,0.15)', border: '1px solid rgba(255,100,100,0.3)', color: '#ffb3b3', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
            ✖️ 해제 ({selectedStocks.size})
          </button>
        )}

        {['ADMIN', 'PAID'].includes(user?.role) && (
          <button onClick={() => setIsReportArchiveOpen(true)} style={{ flexShrink: 0, padding: '0.5rem 0.8rem', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818cf8', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
            <Archive size={14} /> VIP 자료실
          </button>
        )}

        {user?.role === 'ADMIN' && (
          <button onClick={() => setShowAdminPanel(!showAdminPanel)} style={{ flexShrink: 0, padding: '0.5rem 0.8rem', background: 'rgba(0, 136, 204, 0.15)', border: '1px solid rgba(0, 136, 204, 0.3)', color: '#0088cc', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
            <UserCog size={14} /> {showAdminPanel ? '메인 화면' : '관리자 패널'}
          </button>
        )}

        <button onClick={clearAuth} style={{ flexShrink: 0, padding: '0.5rem 0.8rem', background: 'rgba(231, 76, 60, 0.15)', border: '1px solid rgba(231, 76, 60, 0.3)', color: '#e74c3c', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
          <LogOut size={14} /> 로그아웃
        </button>
      </div>

      {showAdminPanel && user?.role === 'ADMIN' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AdminDashboard />
        </div>
      ) : (
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
        {landingTab === 'PPP' ? (
          <PppWatchlist user={user} />
        ) : (
        <>
        {/* 2. Status Widget (수평 스크롤) */}
        <div style={{ 
          display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem', 
          borderBottom: '1px solid var(--glass-border)', scrollbarWidth: 'none', msOverflowStyle: 'none' 
        }}>
          <div style={{ minWidth: '100px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>시스템 상태</div>
            {(() => {
              const ms = getMarketStatus();
              const color = ms === 'live' ? 'var(--success)' : ms === 'afterhours' ? '#f59e0b' : '#6b7280';
              const label = ms === 'live' ? '실시간 가동중' : ms === 'afterhours' ? '시간외 거래' : '장 마감';
              return (
                <div style={{ fontSize: '0.9rem', color, fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div className="pulse-dot" style={{ 
                    width: '6px', height: '6px', 
                    background: ms !== 'live' ? color : '', 
                    boxShadow: ms !== 'live' ? 'none' : '',
                    '--pulse-color': ms === 'live' ? 'rgba(16, 185, 129, 0.7)' : ms === 'afterhours' ? 'rgba(245, 158, 11, 0.7)' : 'rgba(107, 114, 128, 0.4)'
                  }}></div>
                  {label}
                </div>
              );
            })()}
          </div>
          <div style={{ minWidth: '70px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>수신 신호</div>
            <SyncProgressHeader 
              onUpdateRequested={fetchData} 
              fallbackCount={(() => {
                // [Phase 3] signalsSummary Map 기반 카운트
                if (!signalsSummary) return 0;
                return [...signalsSummary.values()].filter(s => {
                    const tf = s.timeframeStatus || {};
                    return Object.keys(tf).some(k => ['30M','1H','2H','4H','1D','2D','1W'].includes(k));
                }).length;
              })()} 
            />
          </div>
          <div style={{ minWidth: '70px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>강력 신호</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 'normal', color: 'var(--accent)' }}>{activeCount}</div>
          </div>
          <div style={{ minWidth: '120px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>주도 섹터</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--secondary)' }}>
              {topSectors.length > 0 ? topSectors.join(' · ') : '분석중'}
            </div>
          </div>
        </div>

        {/* 3. Search & Control Bar */}
        <div style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input 
              type="text" 
              placeholder="종목명/코드 검색..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ 
                width: '100%', padding: '0.75rem 2.5rem 0.75rem 2.2rem', 
                background: 'var(--glass)', border: '1px solid var(--glass-border)', 
                borderRadius: '8px', color: '#fff', fontSize: '0.9rem' 
              }}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', padding: '4px', cursor: 'pointer', display: 'flex' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button 
            onClick={() => setIsBottomSheetOpen(true)}
            style={{ 
              padding: '0 1rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', 
              borderRadius: '8px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}
          >
            <Settings size={20} />
          </button>
        </div>

        {/* 4. Virtual List Container */}
        <div style={{ padding: '0 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            총 <strong>{candidates.length}</strong>개 종목 검색됨
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <input 
              type="checkbox" 
              onChange={toggleSelectAll} 
              checked={candidates.length > 0 && selectedStocks.size === candidates.length} 
              style={{ accentColor: 'var(--primary)', transform: 'scale(1.2)' }}
            />
            전체선택
          </label>
        </div>

        <div style={{ flex: 1, padding: '0 1rem', height: '100%', minHeight: '400px' }}>
          <Virtuoso
            useWindowScroll
            data={candidates}
            itemContent={(index, stock) => (
              <MobileStockCard 
                key={stock.code} 
                stock={stock} 
                manager={manager} 
                isSelected={selectedStocks.has(stock.code)}
                toggleSelection={toggleSelectStock}
              />
            )}
            style={{ height: '100%' }}
            components={{
              Footer: () => (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                  <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: '#ffb86c' }}>⚠️ 본 서비스는 자동 매매가 아닙니다.<br/>모든 투자 판단 및 손실에 대한 책임은 투자자에게 있습니다.</p>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>© 2026 MP Stock. All rights reserved.</p>
                  <p style={{ margin: 0, opacity: 0.7 }}>본 프로그램의 소유권은 MP Stock에 있으며<br/>무단 복제 및 수정을 금합니다.</p>
                </div>
              )
            }}
          />
        </div>
      </>
      )}
    </div>
    )}

      {/* 5. Floating Action Bar (FAB) - 전회원 텔레그램 발송 */}
      {selectedStocks.size > 0 && user && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          width: '90%', maxWidth: '400px', background: 'rgba(0, 136, 204, 0.9)',
          backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '1rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100
        }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
            {selectedStocks.size}개 선택됨
          </div>
          <button 
            onClick={handleSendToTelegram}
            disabled={isSendingTg}
            style={{ 
              background: '#fff', color: '#0088cc', border: 'none', padding: '0.5rem 1rem', 
              borderRadius: '8px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' 
            }}
          >
            {isSendingTg ? <Activity size={16} className="spin" /> : <Share2 size={16} />} 
            텔레그램 발송
          </button>
        </div>
      )}

      {/* 6. Bottom Sheet (Filters) */}
      <BottomSheetFilter 
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        marketFilter={marketFilter} setMarketFilter={setMarketFilter}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        showAll={showAll} setShowAll={setShowAll}
        uploadTimeframe={uploadTimeframe} setUploadTimeframe={setUploadTimeframe}
      />
    </div>
  );
};

export default MobileDashboard;
