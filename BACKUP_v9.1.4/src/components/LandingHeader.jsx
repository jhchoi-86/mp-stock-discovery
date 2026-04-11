import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Rocket, Menu, X } from 'lucide-react';

import UserProfile from './UserProfile';

const LandingHeader = ({ isAuthenticated, onLogoutClick, onLoginClick }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const navigate = useNavigate();

  return (
    <nav className="lp-nav">
      <div className="lp-nav-inner">
        <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
          <div className="lp-logo-icon">
            <Rocket className="text-black" size={20} fill="currentColor" />
          </div>
          <span style={{ color: '#fff' }}>MP <span style={{ color: 'var(--primary)' }}>STOCK</span></span>
        </Link>

        <div className="lp-nav-links" style={{ gap: '1.5rem', alignItems: 'center' }}>
          <Link to="/" className="lp-nav-link" style={{ fontSize: '1rem' }}>Home</Link>
          <a 
            href="#/" 
            onClick={(e) => {
              e.preventDefault();
              if (window.location.hash === '#/' || window.location.hash === '') {
                document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                navigate('/');
                setTimeout(() => {
                  document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            className="lp-nav-link"
            style={{ fontSize: '1rem' }}
          >
            MP 시그널
          </a>
          <Link to="/live-signals" className="lp-nav-link" style={{ fontSize: '1rem' }}>매매 신호포착</Link>
          <Link to="/performance" className="lp-nav-link" style={{ fontSize: '1rem' }}>성과확인</Link>
          <Link to="/backtest" className="lp-nav-link" style={{ fontSize: '1rem' }}>엔진 성능검증</Link>
          <Link to="/analysis" className="lp-nav-link" style={{ fontSize: '1rem' }}>종목 분석</Link>
          
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {isAuthenticated ? (
              <>
                <button 
                  onClick={() => setIsProfileOpen(true)} 
                  className="lp-btn-gold" 
                  style={{ fontSize: '0.9rem', padding: '6px 12px' }}
                >
                  회원정보
                </button>
                <button 
                  onClick={onLogoutClick} 
                  className="lp-btn-gold" 
                  style={{ 
                    fontSize: '0.9rem', 
                    padding: '6px 12px',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)', 
                    color: '#e74c3c', 
                    border: '1px solid rgba(231, 76, 60, 0.3)' 
                  }}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <button onClick={onLoginClick} className="lp-btn-gold" style={{ fontSize: '0.9rem', padding: '6px 16px' }}>로그인</button>
            )}
          </div>
        </div>

        <UserProfile isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

        <button 
          className="lp-mobile-toggle"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="lp-mobile-menu">
          <Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
          <a 
            href="#/" 
            onClick={(e) => {
              e.preventDefault();
              setIsMenuOpen(false);
              if (window.location.hash === '#/' || window.location.hash === '') {
                document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                navigate('/');
                setTimeout(() => {
                  document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
          >
            MP 시그널
          </a>
          <Link to="/live-signals" onClick={() => setIsMenuOpen(false)}>Daily 매매 신호포착</Link>
          <Link to="/performance" onClick={() => setIsMenuOpen(false)}>Daily 성과</Link>
          <Link to="/backtest" onClick={() => setIsMenuOpen(false)}>엔진 성능검증</Link>
          <Link to="/analysis" onClick={() => setIsMenuOpen(false)}>Daily 종목 분석</Link>
          <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)', width: '100%', textAlign: 'center' }}>
            {isAuthenticated ? (
              <button 
                onClick={() => { onLogoutClick(); setIsMenuOpen(false); }} 
                className="lp-btn-gold" 
                style={{ width: '100%', backgroundColor: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.3)' }}
              >
                로그아웃
              </button>
            ) : (
              <button 
                onClick={() => { onLoginClick(); setIsMenuOpen(false); }} 
                className="lp-btn-gold" 
                style={{ width: '100%' }}
              >
                로그인
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default LandingHeader;
