import React from 'react';
import LandingHeader from '../components/LandingHeader';
import LandingPppWidget from '../components/LandingPppWidget';
import { Lock } from 'lucide-react';

/**
 * WatchlistPage Component (v1.0)
 * Dedicated page for PPP Watchlist signals.
 */
const WatchlistPage = ({ user, isAuthenticated, onLogoutClick, onLoginClick }) => {
  return (
    <div className="lp-premium-wrap" style={{ minHeight: '100vh', backgroundColor: '#050505' }}>
      <LandingHeader 
        isAuthenticated={isAuthenticated} 
        onLogoutClick={onLogoutClick} 
        onLoginClick={onLoginClick} 
      />
      
      <main style={{ paddingTop: '80px', paddingBottom: '4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {isAuthenticated ? (
            <div className="fade-in">
                <LandingPppWidget user={user} />
            </div>
          ) : (
            <div style={{ padding: '0 1.5rem' }}>
                <div className="lp-auth-wall" style={{ 
                  textAlign: 'center', 
                  padding: '5rem 2rem', 
                  backgroundColor: 'rgba(212, 175, 55, 0.03)', 
                  borderRadius: '24px', 
                  border: '1px solid var(--glass-border)',
                  marginTop: '4rem'
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
                    PPP 고수의 자동 워치리스트 (Premium)
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto 2.5rem' }}>
                    전문가용 AI 로직이 포착한 강력한 매수 타점 현황을 확인해 보세요.<br/>
                    본 서비스는 유료 회원 등급만 접근 가능한 프리미엄 메뉴입니다.
                  </p>
                  <button 
                    onClick={onLoginClick}
                    className="lp-btn-gold"
                    style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}
                  >
                    로그인 후 관심종목 보기
                  </button>
                </div>
            </div>
          )}
        </div>
      </main>

      <footer style={{ padding: '4rem 0', borderTop: '1px solid var(--glass-border)', textAlign: 'center', opacity: 0.5 }}>
        <p style={{ fontSize: '0.8rem', color: '#fff' }}>© 2026 MP Stock. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default WatchlistPage;
