import React from 'react';

/**
 * [TASK] MaintenancePage.jsx (v3.0)
 * 성과확인 페이지 장애 조치 중 일시적으로 노출할 점검 페이지입니다.
 */
const MaintenancePage = () => (
  <div style={{ 
    padding: '100px 20px', 
    textAlign: 'center', 
    background: 'var(--bg-default)', 
    minHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#fff'
  }}>
    <div style={{ 
      background: 'rgba(255,255,255,0.05)', 
      padding: '3rem', 
      borderRadius: '24px', 
      border: '1px solid rgba(255,255,255,0.1)',
      maxWidth: '600px'
    }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>
        🏗️ 성과확인 기능 점검 중
      </h2>
      <p style={{ marginTop: '12px', color: '#aaa', fontSize: '1.1rem', lineHeight: '1.6' }}>
        시스템 정밀 점검 및 로직 최적화 작업으로 인해<br/>
        일시적으로 이용이 제한됩니다.
      </p>
      <div style={{ 
        marginTop: '2rem', 
        padding: '1rem', 
        background: 'rgba(255,77,77,0.1)', 
        borderRadius: '12px',
        color: '#ff4d4d',
        fontSize: '0.9rem'
      }}>
        빠른 시간 내에 더 안정적인 서비스로 복구하겠습니다. 이용에 불편을 드려 죄송합니다.
      </div>
    </div>
  </div>
);

export default MaintenancePage;
