import React from 'react';
import LandingHeader from '../components/LandingHeader';
import DailySnapshotAnalytics from '../components/DailySnapshotAnalytics';
import { Lock, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { useTop5Stocks } from '../hooks/useStockSnapshot';

const AnalysisPage = ({ onLoginClick, isAuthenticated, onLogoutClick }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: top5Data, isLoading } = useTop5Stocks(selectedDate);
  const stocks = top5Data?.data ?? [];

  return (
    <div className="lp-premium-wrap" style={{ minHeight: '100vh', backgroundColor: '#050505' }}>
      <LandingHeader 
        isAuthenticated={isAuthenticated} 
        onLogoutClick={onLogoutClick} 
        onLoginClick={onLoginClick} 
      />
      <main style={{ paddingTop: '80px', paddingBottom: '4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
          {isAuthenticated ? (
            <div className="fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <BarChart3 color="var(--primary)" size={32} /> Daily 종목 분석
                    </h2>
                    <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ padding: '0.6rem 1rem', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}
                    />
                </div>
                <DailySnapshotAnalytics overrideData={stocks} isLoading={isLoading} />
            </div>
          ) : (
            <div className="lp-auth-wall" style={{ 
              textAlign: 'center', 
              padding: '5rem 2rem', 
              backgroundColor: 'rgba(212, 175, 55, 0.03)', 
              borderRadius: '24px', 
              border: '1px solid var(--glass-border)',
              marginTop: '2rem'
            }}>
              <div style={{ 
                width: '80px', 
                height: '80px', 
                backgroundColor: 'rgba(212, 175, 55, 0.1)', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 2rem' 
              }}>
                <Lock size={40} color="var(--primary)" />
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '1rem' }}>
                프리미엄 분석 대시보드
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto 2.5rem' }}>
                'Daily 종목 분석' 데이터는 승인된 회원만 열람 가능합니다.<br/>
                가장 정밀한 AI 분석 데이터를 지금 바로 확인해 보세요.
              </p>
              <button 
                onClick={onLoginClick}
                className="lp-btn-gold"
                style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}
              >
                로그인 후 데이터 보기
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer (Simplified) */}
      <footer style={{ padding: '4rem 0', borderTop: '1px solid var(--glass-border)', textAlign: 'center', opacity: 0.5 }}>
        <p style={{ fontSize: '0.8rem' }}>© 2026 MP Stock. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default AnalysisPage;
