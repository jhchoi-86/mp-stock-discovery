import React, { useState } from 'react';
import authService from '../api/authService';
import useAuthStore from '../store/authStore';
import { Bot, Zap, Target } from 'lucide-react';

const Login = () => {
  const setAuth = useAuthStore(state => state.setAuth);
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agreeRisk, setAgreeRisk] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (isRegisterMode) {
        // Handle Registration
        if (!name.trim() || !phone.trim()) {
          throw new Error('이름과 핸드폰 번호를 모두 입력해주세요.');
        }
        if (!agreeRisk) {
          throw new Error('투자 손실 위험에 대한 책임에 동의하셔야 합니다.');
        }
        await authService.register(email, password, name, phone);
        alert('회원가입이 완료되었습니다. 로그인 해주세요.');
        setIsRegisterMode(false);
      } else {
        // Handle Login
        const response = await authService.login(email, password);
        // Login returns User object
        setAuth(response.user);
      }
    } catch (err) {
      console.error(err);
      const status = err.response?.status;
      let uiError = '인증 처리 중 오류가 발생했습니다.';
      
      if (status === 401) {
        uiError = '이메일 또는 비밀번호가 올바르지 않습니다.';
      } else if (status === 409) {
        uiError = '이미 가입된 이메일 주소입니다.';
      } else if (status === 400) {
        uiError = '이메일과 비밀번호 형식을 다시 확인해주세요.';
      } else if (status === 429) {
        uiError = '너무 많은 시도가 감지되었습니다. 잠시 후 다시 시도해주세요.';
      } else if (err.response?.data?.error) {
        // Fallback to backend string if no predefined status
        uiError = err.response.data.error;
      } else if (err.message) {
        uiError = err.message;
      }

      setErrorMsg(uiError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-split-container fade-in">
      {/* Left Branding Panel */}
      <div className="login-left-panel">
        <span className="brand-title">MP STOCK DISCOVERY</span>
        <h1 className="hero-title">최적의 투자,<br />데이터가 말하다.</h1>
        <p className="hero-subtitle">스마트한 데이터 분석으로 당신의 다음 성공 종목을 미리 확인하세요.</p>
        
        <div className="feature-list">
          <div className="feature-item">
            <div className="feature-icon-wrapper"><Bot size={24} /></div>
            알고리즘 기반 AI 주식 분석
          </div>
          <div className="feature-item">
            <div className="feature-icon-wrapper"><Zap size={24} /></div>
            실시간 매수/매도 시그널 포착
          </div>
          <div className="feature-item">
            <div className="feature-icon-wrapper"><Target size={24} /></div>
            전문가의 진입가 및 목표가 추천
          </div>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="login-right-panel">
        <div className="glass-panel">
          <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: '#fff', fontSize: '1.5rem', fontWeight: '800' }}>
            {isRegisterMode ? '회원가입 (Sign Up)' : '주식종목발굴 로그인'}
          </h2>
        
        {errorMsg && (
          <div style={{
            backgroundColor: 'rgba(231, 76, 60, 0.2)',
            color: '#e74c3c',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            textAlign: 'center',
            fontSize: '0.9rem'
          }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isRegisterMode && (
            <>
              <input 
                type="text" 
                placeholder="이름 (Name)" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="glass-input"
              />
              <input 
                type="tel" 
                placeholder="휴대폰 번호 (Phone - 예: 01012345678)" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="glass-input"
              />
              <div style={{ padding: '0.8rem', backgroundColor: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: '4px', color: '#ff6b6b', fontSize: '0.85rem', textAlign: 'center', fontWeight: 'bold' }}>
                ⚠️ 회원가입 후 관리자의 승인이 완료되어야 로그인이 가능합니다.
              </div>
            </>
          )}
          
          <input 
            type="email" 
            placeholder="이메일 (Email)" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="glass-input"
          />
          
          <input 
            type="password" 
            placeholder="비밀번호 (Password)" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="glass-input"
          />

          {isRegisterMode && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.5rem 0.2rem' }}>
              <input 
                type="checkbox" 
                id="agreeRisk" 
                checked={agreeRisk}
                onChange={(e) => setAgreeRisk(e.target.checked)}
                required
                style={{ marginTop: '3px', cursor: 'pointer', transform: 'scale(1.1)', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="agreeRisk" style={{ cursor: 'pointer', lineHeight: '1.4', fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)' }}>
                본 서비스는 자동 매매가 아니며, 제공되는 정보에 따른 투자 판단과 최종 결과에 대한 책임은 전적으로 사용자 본인에게 있음을 인지하고 이에 동의합니다. <span style={{color: 'var(--accent)', fontWeight: 'bold'}}>(필수)</span>
              </label>
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="glass-btn"
            style={{ marginTop: '0.5rem' }}
          >
            {isLoading ? '처리중...' : (isRegisterMode ? '가입하기' : '로그인 시작하기')}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          {isRegisterMode ? '이미 계정이 있으신가요? ' : '아직 계정이 없으신가요? '}
          <span 
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setErrorMsg('');
            }} 
            style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isRegisterMode ? '로그인' : '회원가입'}
          </span>
        </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
