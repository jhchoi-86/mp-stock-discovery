import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import useAuthStore from './store/authStore.js';
import Login from './components/Login.jsx';
import PcDashboard from './components/PcDashboard.jsx';
import MobileDashboard from './components/MobileDashboard.jsx';
import { useStockManager } from './hooks/useStockManager.js';
import useIsMobile from './hooks/useIsMobile.js';

const App = () => {
  const { user, isAuthenticated, isInitialized, initAuth, clearAuth } = useAuthStore();
  const isMobile = useIsMobile(768);
  const manager = useStockManager(isAuthenticated);

  useEffect(() => {
    initAuth();
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
