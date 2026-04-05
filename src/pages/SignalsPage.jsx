import React from 'react';
import LandingHeader from '../components/LandingHeader';
import SignalBoard from '../components/SignalBoard';
import { Lock, Zap } from 'lucide-react';

const SignalsPage = ({ isAuthenticated, onLogoutClick, onLoginClick }) => {
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
            <div style={{ marginTop: '2rem' }}>
                <SignalBoard />
            </div>
          ) : (
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
                Daily 매매 신호포착 (실시간)
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto 2.5rem' }}>
                실시간 절대신호 포착 현황은 유료 회원 등급만 접근 가능한 프리미엄 서비스입니다.<br/>
                지금 바로 전문가용 시그널 보드를 확인해 보세요.
              </p>
              <button 
                onClick={onLoginClick}
                className="lp-btn-gold"
                style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}
              >
                로그인 후 실시간 보드 보기
              </button>
            </div>
          )}
        </div>
      </main>

      <footer style={{ padding: '4rem 0', borderTop: '1px solid var(--glass-border)', textAlign: 'center', opacity: 0.5 }}>
        <p style={{ fontSize: '0.8rem' }}>© 2026 MP Stock. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default SignalsPage;
