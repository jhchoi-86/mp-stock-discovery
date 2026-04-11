import React from 'react';
import LandingHeader from './LandingHeader';
import BacktestReportWidget from './BacktestReportWidget';

const BacktestPage = ({ isAuthenticated, onLogoutClick, onLoginClick }) => {
  return (
    <div className="lp-premium-wrap">
      <div className="lp-container">
        <LandingHeader 
          isAuthenticated={isAuthenticated} 
          onLogoutClick={onLogoutClick} 
          onLoginClick={onLoginClick} 
        />
        
        <main style={{ minHeight: '80vh', padding: '6rem 1.5rem' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Page Header */}
            <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
              <h1 style={{ fontSize: '3.5rem', fontWeight: 900, color: '#fff', marginBottom: '1.5rem', tracking: 'tight' }}>
                엔진 성능 <span style={{ color: 'var(--primary)' }}>검증 센터</span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                MP STOCK의 AI 알고리즘이 예측한 실시간 Top 5 종목의 수익성을<br/>
                과거 틱 데이터를 기반으로 투명하게 직접 검증해 보세요.
              </p>
            </div>

            {/* Backtest Widget */}
            <BacktestReportWidget />

            {/* Notice Section */}
            <div style={{ marginTop: '4rem', padding: '2rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '2rem', border: '1px solid var(--glass-border)' }}>
              <h3 style={{ color: '#fff', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--primary)' }}>●</span> 시뮬레이션 안내사항
              </h3>
              <ul style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.8, listStyle: 'none', padding: 0 }}>
                <li>• 본 시뮬레이션은 최신 틱 데이터 모델링을 사용하여 시장의 변동성을 재현합니다.</li>
                <li>• 실제 매매 시 발생할 수 있는 0.7%의 슬리피지(체결 오차)를 반영하여 더욱 보수적이고 신뢰도 높은 데이터를 제공합니다.</li>
                <li>• 시뮬레이션 결과는 투자 참고용이며, 실제 투자 수익을 확정적으로 보장하지 않습니다.</li>
              </ul>
            </div>
          </div>
        </main>

        <footer className="lp-footer">
          <div className="lp-footer-inner" style={{ borderTop: '1px solid var(--glass-border)', padding: '4rem 0' }}>
            <p style={{ fontSize: '0.8rem', color: '#555', textAlign: 'center' }}>
              Copyright © 2026 MP Stock. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default BacktestPage;
