import React from 'react';
import { useSSE } from '../hooks/useSSE';

/**
 * [AI NOTICE: SyncProgressHeader.jsx]
 * PcDashboard 메인 리렌더링 없이 SSE 진행률만 별도로 렌더링하는 전용 부품입니다.
 */
const SyncProgressHeader = ({ onUpdateRequested, fallbackCount = 0, localProgress = null }) => {
    const { progress: sseProgress, isConnected, error } = useSSE();

    // 로컬 진행률(동기화 중)이 있으면 그것을 우선 사용, 없으면 SSE 사용
    const isActiveSync = localProgress && localProgress.current > 0;
    const displayProgress = isActiveSync ? localProgress : sseProgress;
    const isSyncing = displayProgress.current > 0 && (isActiveSync || displayProgress.current < displayProgress.total);

    return (
        <div className="stat-item" style={{ minWidth: '120px' }}>
            <div className="stat-label">수신 신호</div>
            <div className="stat-value">
                {isSyncing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            {displayProgress.timeframe ? `[${displayProgress.timeframe}] ` : ''}{displayProgress.current} / {displayProgress.total}
                        </span>
                        {/* 미니 프로그레스 바 */}
                        <div style={{ 
                            width: '100%', 
                            height: '4px', 
                            background: 'rgba(255,255,255,0.1)', 
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}>
                            <div style={{ 
                                width: `${(displayProgress.current / displayProgress.total) * 100}%`, 
                                height: '100%', 
                                background: 'var(--primary)',
                                transition: 'width 0.3s ease-out'
                            }} />
                        </div>
                    </div>
                ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {fallbackCount}
                        {!isConnected && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--warning)', fontWeight: 'normal' }}>
                                {error || "연결 확인중..."}
                            </span>
                        )}
                        {isConnected && <div className="pulse-dot" style={{ width: '6px', height: '6px' }}></div>}
                    </span>
                )}
            </div>
        </div>
    );
};

export default SyncProgressHeader;
