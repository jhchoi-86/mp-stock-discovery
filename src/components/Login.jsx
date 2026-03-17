import React, { useState } from 'react';
import authService from '../api/authService';
import useAuthStore from '../store/authStore';

const Login = () => {
  const setAuth = useAuthStore(state => state.setAuth);
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (isRegisterMode) {
        // Handle Registration
        if (!name.trim()) {
          throw new Error('이름을 입력해주세요.');
        }
        await authService.register(email, password, name);
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
    <div style={{
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      backgroundColor: 'var(--bg-default)' 
    }}>
      <div className="card fade-in" style={{
        padding: '2rem',
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'var(--glass)',
        border: '1px solid var(--glass-border)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#fff' }}>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isRegisterMode && (
            <input 
              type="text" 
              placeholder="이름 (Name)" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
            />
          )}
          
          <input 
            type="email" 
            placeholder="이메일 (Email)" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          
          <input 
            type="password" 
            placeholder="비밀번호 (Password)" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />

          <button 
            type="submit" 
            disabled={isLoading}
            style={{
              ...buttonStyle,
              backgroundColor: isLoading ? '#555' : 'var(--primary)',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? '처리중...' : (isRegisterMode ? '가입하기' : '로그인')}
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
  );
};

const inputStyle = {
  padding: '0.75rem 1rem',
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid var(--glass-border)',
  color: '#fff',
  borderRadius: '4px',
  outline: 'none',
  fontSize: '1rem'
};

const buttonStyle = {
  padding: '0.75rem',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  fontWeight: 'bold',
  fontSize: '1rem',
  transition: 'background-color 0.2s',
  marginTop: '0.5rem'
};

export default Login;
