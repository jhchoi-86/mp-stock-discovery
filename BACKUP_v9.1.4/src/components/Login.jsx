import React, { useState } from 'react';
import authService from '../api/authService';
import useAuthStore from '../store/authStore';
import { Bot, Zap, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Login = ({ onBack }) => {
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();
  
  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/');
  };
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [agreeRisk, setAgreeRisk] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (isForgotPasswordMode) {
        if (!isVerified) {
          // Step 1: Verify Identity (Secure Check)
          await authService.verifyIdentity(email, name, phone);
          setIsVerified(true);
          setVerifiedUserId(null); // No longer needed as we send all info in Step 2
          setSuccessMsg('본인 인증에 성공했습니다. 새로운 비밀번호를 입력해주세요.');
        } else {
          // Step 2: Reset Password (Combined verification + execution)
          await authService.resetPassword(email, name, phone, newPassword);
          alert('비밀번호가 성공적으로 변경되었습니다. 새로운 비밀번호로 로그인해주세요.');
          setIsForgotPasswordMode(false);
          setIsVerified(false);
          setPassword('');
          setNewPassword('');
        }
      } else if (isRegisterMode) {
        // Handle Registration
        if (!name.trim() || !phone.trim() || !referralCode.trim()) {
          throw new Error('이름, 핸드폰 번호, 추천코드를 모두 입력해주세요.');
        }
        if (!agreeRisk) {
          throw new Error('투자 손실 위험에 대한 책임에 동의하셔야 합니다.');
        }
        await authService.register(email, password, name, phone, referralCode);
        alert('회원가입이 완료되었습니다. 관리자 승인 대기 후 로그인 해주세요.');
        setIsRegisterMode(false);
      } else {
        // Handle Login
        const response = await authService.login(email, password);
        setAuth(response.user);
        navigate('/');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || err.message || '처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-split-container fade-in">
      {/* Go Back to Landing (New) */}
      {onBack && (
        <button 
          onClick={handleBack}
          style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem' }}
          className="hover:text-white transition-colors"
        >
          ← 홈으로 돌아가기
        </button>
      )}

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
            {isForgotPasswordMode ? '비밀번호 재설정' : (isRegisterMode ? '회원가입 (Sign Up)' : '주식종목발굴 로그인')}
          </h2>
        
        {errorMsg && (
          <div style={{ backgroundColor: 'rgba(231, 76, 60, 0.2)', color: '#e74c3c', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ backgroundColor: 'rgba(46, 204, 113, 0.2)', color: '#2ecc71', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isForgotPasswordMode ? (
            !isVerified ? (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '0.5rem' }}>
                  가입 시 입력한 정보를 입력하여 본인 인증을 진행해 주세요.
                </p>
                <input 
                  type="email" 
                  placeholder="이메일 (Email)" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-input"
                />
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
              </>
            ) : (
              <>
                <input 
                  type="password" 
                  placeholder="새 비밀번호 (New Password)" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="glass-input"
                />
              </>
            )
          ) : (
            <>
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
                  <input 
                    type="text" 
                    placeholder="추천인 코드 (Referral Code - 5자리 필수)" 
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase().slice(0, 5))}
                    required
                    className="glass-input"
                    style={{ border: '1px solid var(--accent)' }}
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
            </>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="glass-btn"
            style={{ marginTop: '0.5rem' }}
          >
            {isLoading ? '처리중...' : (
              isForgotPasswordMode ? (isVerified ? '비밀번호 변경하기' : '본인 인증하기') :
              (isRegisterMode ? '가입하기' : '로그인 시작하기')
            )}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          {isForgotPasswordMode ? (
            <span 
              onClick={() => {
                setIsForgotPasswordMode(false);
                setIsVerified(false);
                setErrorMsg('');
                setSuccessMsg('');
              }} 
              style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              로그인 화면으로 돌아가기
            </span>
          ) : (
            <>
              {isRegisterMode ? '이미 계정이 있으신가요? ' : '아직 계정이 없으신가요? '}
              <span 
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setErrorMsg('');
                  setSuccessMsg('');
                }} 
                style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {isRegisterMode ? '로그인' : '회원가입'}
              </span>
              {!isRegisterMode && (
                <div style={{ marginTop: '0.75rem' }}>
                  <span 
                    onClick={() => {
                      setIsForgotPasswordMode(true);
                      setErrorMsg('');
                      setSuccessMsg('');
                    }} 
                    style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    비밀번호를 잊으셨나요?
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  </div>
);
};
export default Login;
