import React, { useState } from 'react';
import { Search, Settings, Share2, Activity, RotateCcw, LogOut, UserCog, Archive, X } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import UserProfile from './UserProfile.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import ReportArchive from './ReportArchive.jsx';
import MobileStockCard from './MobileStockCard.jsx';
import BottomSheetFilter from './BottomSheetFilter.jsx';

const MobileDashboard = ({ manager, user, clearAuth }) => {
  const {
      searchQuery, setSearchQuery,
      marketFilter, setMarketFilter,
      categoryFilter, setCategoryFilter,
      showAll, setShowAll,
      uploadTimeframe, setUploadTimeframe,
      isSyncing, isSendingTg,
      candidates, topSectors, activeCount, signals, selectedStocks,
      handleAutoSync, handleSendToTelegram,
      toggleSelectStock, toggleSelectAll
  } = manager;

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isReportArchiveOpen, setIsReportArchiveOpen] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: '#fff' }}>
      {/* 1. Sticky Top Navigation */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--glass-border)', padding: '0.75rem 1rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, background: 'linear-gradient(to right, var(--primary), var(--secondary))', WebkitBackgroundClip: 'text', color: 'transparent' }}>
            MP STOCK
          </h1>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
            VIP
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => setIsProfileOpen(true)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
            {user?.name || user?.email?.split('@')[0]}
          </button>
        </div>
      </header>
      
      {/* User Profile Modal Map */}
      <UserProfile isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <ReportArchive isOpen={isReportArchiveOpen} onClose={() => setIsReportArchiveOpen(false)} />

      {/* Quick Action Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.75rem 1rem', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <button onClick={() => handleAutoSync()} style={{ flexShrink: 0, padding: '0.5rem 0.8rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
          <RotateCcw size={14} className={isSyncing ? "spin" : ""} /> {isSyncing ? '동기화 중...' : '동기화'}
        </button>

        {['ADMIN', 'PRO_USER'].includes(user?.role) && (
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
        {/* 2. Status Widget (수평 스크롤) */}
        <div style={{ 
          display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem', 
          borderBottom: '1px solid var(--glass-border)', scrollbarWidth: 'none', msOverflowStyle: 'none' 
        }}>
          <div style={{ minWidth: '100px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>시스템 상태</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--success)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div className="pulse-dot" style={{ width: '6px', height: '6px' }}></div> 실시간 가동중
            </div>
          </div>
          <div style={{ minWidth: '70px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>수신 신호</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary)' }}>{signals.length}</div>
          </div>
          <div style={{ minWidth: '70px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>강력 신호</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent)' }}>{activeCount}</div>
          </div>
          <div style={{ minWidth: '120px', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>주도 섹터</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--secondary)' }}>
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
          />
        </div>
      </div>
      )}

      {/* 5. Floating Action Bar (FAB) - 관리자 전용 텔레그램 발송 */}
      {selectedStocks.size > 0 && user?.role === 'ADMIN' && (
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
