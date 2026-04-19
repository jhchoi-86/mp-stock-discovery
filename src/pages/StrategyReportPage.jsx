import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import LandingHeader from '../components/LandingHeader';
import { 
  TrendingUp, 
  Target, 
  ShieldAlert, 
  ChevronRight, 
  Copy, 
  ExternalLink,
  Zap,
  RefreshCw,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * StrategyReportPage.jsx (v9.8.0)
 * -----------------------------
 * PPP 엔진 v9.7.9의 데이터를 기반으로 한 Top 10 매매 전략 전용 페이지.
 * 현재가, 진입가, 눌림목진입가, 손절가, 목표가, 지표근거 필드 포함.
 */
const StrategyReportPage = ({ isAuthenticated, onLogoutClick, onLoginClick }) => {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reportInfo, setReportInfo] = useState({ version: 'v9.8.9', source: 'db' });

  const fetchStrategy = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.get('/api/strategy/top10');
      if (response.data && response.data.success) {
        setStocks(response.data.data);
        setReportInfo({
          version: response.data.version || 'v9.8.5',
          source: response.data.source || 'db',
          updatedAt: response.data.updatedAt
        });
        setLastUpdated(new Date(response.data.updatedAt || response.data.timestamp).toLocaleTimeString());
      }
    } catch (err) {
      console.error('[Strategy Fetch Error]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStrategy();
    }
  }, [isAuthenticated]);

  const copyToClipboard = (stock) => {
    const text = `🚨 [MP Stock 전략 리포트]\n` +
                 `📌 종목명: ${stock.name} (${stock.code})\n` +
                 `💰 현재가: ${stock.current_price?.toLocaleString()}원\n` +
                 `🎯 1차 진입가: ${stock.entry_1?.toLocaleString()}원\n` +
                 `📉 눌림목 진입: ${stock.entry_2?.toLocaleString()}원\n` +
                 `🚀 목표가: ${stock.target?.toLocaleString()}원\n` +
                 `🛡️ 손절가: ${stock.stop_loss?.toLocaleString()}원\n` +
                 `📝 지표근거: ${stock.rationale}\n` +
                 `🔗 차트보기: ${stock.chartUrl}`;
    
    navigator.clipboard.writeText(text);
    toast.success(`${stock.name} 전략 복사 완료!`, {
      icon: '📋',
      style: { background: '#1e293b', color: '#fff', borderRadius: '12px' }
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="lp-premium-wrap" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <LandingHeader onLoginClick={onLoginClick} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
          <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '500px' }}>
            <ShieldAlert size={64} color="var(--accent)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ marginBottom: '1rem', fontWeight: 800 }}>Premium Content Only</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
              매매 전략 리포트는 승인된 유료 회원만 이용 가능합니다.<br/>
              로그인 후 전문가용 전략을 확인하세요.
            </p>
            <button onClick={onLoginClick} className="lp-btn-gold" style={{ width: '100%' }}>
              로그인 하여 리포트 보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-premium-wrap" style={{ minHeight: '100vh', backgroundColor: '#050505' }}>
      <LandingHeader 
        isAuthenticated={isAuthenticated} 
        onLogoutClick={onLogoutClick} 
        onLoginClick={onLoginClick} 
      />

      <main style={{ paddingTop: '100px', paddingBottom: '4rem' }}>
        <div className="container">
          {/* Page Title & Stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
            <div>
              <div className="brand-title" style={{ marginBottom: '0.5rem' }}>PPP STRATEGY REPORT {reportInfo.version || 'v9.8.9'}</div>
              <h1 className="hero-title" style={{ fontSize: '2.5rem', margin: 0 }}>Top 10 매매 전략 가이드</h1>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                PPP 엔진 {reportInfo.version || 'v9.8.9'}의 확정 신호와 멀티 타임프레임 지표를 결합한 필승 전략
              </p>
            </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>최종 업데이트: {lastUpdated}</span>
              <button 
                onClick={fetchStrategy} 
                disabled={loading}
                style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--glass-border)', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '8px', 
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                새로고침
              </button>
            </div>
          </div>

          {loading ? (
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
               {[...Array(6)].map((_, i) => (
                 <div key={i} className="card skeleton" style={{ height: '350px', opacity: 0.5 }}></div>
               ))}
             </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
              {stocks.map((stock, idx) => (
                <div key={stock.code} className="card fade-in" style={{ animationDelay: `${idx * 0.1}s`, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', opacity: 0.1, fontSize: '4rem', fontWeight: 900 }}>{idx + 1}</div>
                  
                  {/* Header (Clickable for Chart) */}
                  <a 
                    href={stock.chartUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{ textDecoration: 'none', display: 'block', marginBottom: '1.5rem' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="stock-info">
                        <span className="stock-name" style={{ fontSize: '1.25rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{stock.name}</span>
                        <span className="stock-code">{stock.code}</span>
                      </div>
                      <div className="badge badge-primary">
                        <TrendingUp size={12} style={{ marginRight: '4px' }} />
                        Score {stock.score}
                      </div>
                    </div>
                  </a>

                  {/* Price Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>현재가</label>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{stock.current_price?.toLocaleString()}원</span>
                    </div>
                    <div style={{ background: 'rgba(212, 175, 55, 0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--accent)', display: 'block', marginBottom: '0.25rem' }}>1차 진입가</label>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{stock.entry_1?.toLocaleString()}원</span>
                    </div>
                    <div style={{ background: 'rgba(0, 210, 255, 0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(0, 210, 255, 0.2)' }}>
                      <label style={{ fontSize: '0.7rem', color: '#00d2ff', display: 'block', marginBottom: '0.25rem' }}>눌림목(2차)</label>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{stock.entry_2?.toLocaleString()}원</span>
                    </div>
                    <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--success)', display: 'block', marginBottom: '0.25rem' }}>목표가</label>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{stock.target?.toLocaleString()}원</span>
                    </div>
                  </div>

                  {/* Stop Loss */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <ShieldAlert size={16} color="#f87171" />
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.65rem', color: '#f87171', display: 'block' }}>최종 손절마크</label>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{stock.stop_loss?.toLocaleString()}원</span>
                    </div>
                  </div>

                  {/* Rationale */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                      <Zap size={14} color="var(--accent)" />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>기술적 지표 근거</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                      {stock.rationale}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => copyToClipboard(stock)}
                      className="lp-btn-gold" 
                      style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                    >
                      <Copy size={14} />
                      전략 복사
                    </button>
                    <a 
                      href={stock.chartUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="lp-nav-link"
                      style={{ 
                        flex: 1, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '0.4rem', 
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        fontSize: '0.85rem'
                      }}
                    >
                      차트 <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer Note */}
          <div style={{ marginTop: '4rem', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
            <Info size={24} color="var(--accent)" style={{ marginBottom: '1rem' }} />
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', maxWidth: '800px', margin: '0 auto' }}>
              본 전략 리포트는 {reportInfo.source === 'file' ? 'AI 전문 분석' : `PPP 엔진 ${reportInfo.version || 'v9.8.5'}`}에 의해 자동 산출되었으며, 1:1 매칭된 Pine Script 수식을 기반으로 합니다. 
              시장의 급격한 변동성이 발생할 경우 실시간 신호 보드와 반드시 병행하여 투자를 판단해 주시기 바랍니다.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StrategyReportPage;
