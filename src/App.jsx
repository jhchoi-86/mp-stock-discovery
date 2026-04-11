import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore.js';
import authService from './api/authService.js';
import Login from './components/Login.jsx';
import PcDashboard from './components/PcDashboard.jsx';
import MobileDashboard from './components/MobileDashboard.jsx';
import { useStockManager } from './hooks/useStockManager.js';
import useIsMobile from './hooks/useIsMobile.js';
import useSecurityShield from './hooks/useSecurityShield.js';
import LandingPage from './components/LandingPage.jsx';
import { SSEProvider } from './context/SSEContext.jsx';
import { Routes, Route, useNavigate } from 'react-router-dom';
import PerformancePage from './pages/PerformancePage.jsx';
import AnalysisPage from './pages/AnalysisPage.jsx';
import SignalsPage from './pages/SignalsPage.jsx';
import BacktestPage from './components/BacktestPage.jsx';

const App = () => {
  const { user, isAuthenticated, isInitialized, initAuth, clearAuth } = useAuthStore();
   const isMobile = useIsMobile(768);
   const manager = useStockManager(isAuthenticated);
   const navigate = useNavigate();

  const isManagementUser = user && user.role === 'ADMIN';

  // 플랜 1, 2: 프론트엔드 보안 방패 적용 및 콘솔 경고
  useSecurityShield(user?.role);

  useEffect(() => {
    initAuth();
    
    // 강렬한 경고 메시지 출력
    console.log(
      '%c⚠️ 경고: 불법 복제 및 무단 수정 금지 ⚠️\n\n' +
      '%c본 프로그램의 모든 소스코드는 MP Stock의 지적재산입니다.\n' +
      '승인되지 않은 무단 접근, 복제, 수정 및 유출 시도 로그는 시스템에 실시간 기록되며,\n' +
      '관련 법령에 의거하여 강력한 민형사상 책임을 질 수 있습니다.\n\n' +
      'Copyright © 2026 MP Stock. All rights reserved.',
      'color: red; font-size: 20px; font-weight: bold; text-shadow: 1px 1px 0 #000;',
      'color: yellow; font-size: 14px; font-weight: bold; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 8px;'
    );
  }, [initAuth]);

  const handleLoginClick = () => navigate('/login');

  if (!isInitialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-default)', color: 'white' }}>
        <RefreshCw className="spin" size={32} />
        <span style={{ marginLeft: '1rem' }}>인증 정보를 불러오는 중입니다...</span>
      </div>
    );
  }

  return (
    <div className="dashboard-root">
      <Toaster position="bottom-right" />
      <SSEProvider onUpdateRequested={manager.fetchData}>
          <Routes>
            {/* Common Routes available to everyone */}
            <Route path="/performance" element={<PerformancePage onLoginClick={handleLoginClick} isAuthenticated={isAuthenticated} onLogoutClick={authService.logout} />} />
            <Route path="/analysis" element={<AnalysisPage onLoginClick={handleLoginClick} isAuthenticated={isAuthenticated} onLogoutClick={authService.logout} />} />
            <Route path="/live-signals" element={<SignalsPage onLoginClick={handleLoginClick} isAuthenticated={isAuthenticated} onLogoutClick={authService.logout} />} />
            <Route path="/backtest" element={<BacktestPage onLoginClick={handleLoginClick} isAuthenticated={isAuthenticated} onLogoutClick={authService.logout} />} />

            {/* Role-based Home Route */}
            <Route path="/" element={
              !isAuthenticated ? (
                <LandingPage onLoginClick={handleLoginClick} />
              ) : (
                isManagementUser ? (
                  isMobile ? <MobileDashboard manager={manager} user={user} clearAuth={authService.logout} /> : <PcDashboard manager={manager} user={user} clearAuth={authService.logout} />
                ) : (
                  <LandingPage onLoginClick={handleLoginClick} isAuthenticated={true} onLogoutClick={authService.logout} />
                )
              )
            } />

            {/* Login Route (Fallback for direct access) */}
            <Route path="/login" element={<Login onBack={() => navigate('/')} />} />
          </Routes>
      </SSEProvider>

    </div>
  );
};

export default App;
