import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import useAuthStore from './store/authStore.js';
import Login from './components/Login.jsx';
import PcDashboard from './components/PcDashboard.jsx';
import MobileDashboard from './components/MobileDashboard.jsx';
import { useStockManager } from './hooks/useStockManager.js';
import useIsMobile from './hooks/useIsMobile.js';
import useSecurityShield from './hooks/useSecurityShield.js';

const App = () => {
  const { user, isAuthenticated, isInitialized, initAuth, clearAuth } = useAuthStore();
  const isMobile = useIsMobile(768);
  const manager = useStockManager(isAuthenticated);

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
      'Copyright © 2024 MP Stock. All rights reserved.',
      'color: red; font-size: 20px; font-weight: bold; text-shadow: 1px 1px 0 #000;',
      'color: yellow; font-size: 14px; font-weight: bold; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 8px;'
    );
  }, [initAuth]);

  if (!isInitialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-default)', color: 'white' }}>
        <RefreshCw className="spin" size={32} />
        <span style={{ marginLeft: '1rem' }}>인증 정보를 불러오는 중입니다...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return isMobile ? (
    <MobileDashboard manager={manager} user={user} clearAuth={clearAuth} />
  ) : (
    <PcDashboard manager={manager} user={user} clearAuth={clearAuth} />
  );
};

export default App;
