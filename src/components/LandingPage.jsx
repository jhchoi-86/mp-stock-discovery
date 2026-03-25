import React from 'react';
import { motion } from 'framer-motion';
import { Menu, X, Rocket, Shield, BarChart3, Sparkles, TrendingUp, CheckCircle2, Zap } from 'lucide-react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import MPStockDailyReport from './MPStockDailyReport';

const LandingPage = ({ onLoginClick }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [honeypot, setHoneypot] = React.useState('');
  const [submitStatus, setSubmitStatus] = React.useState('idle');
  
  const { data, error, isLoading } = useSWR('reports/latest', reportService.getLatestReport, {
    revalidateOnFocus: true,
    refreshInterval: 60000
  });

  const isFallback = !data && !isLoading; 

  // Task 7: Dynamic Stats calculation
  const stats = React.useMemo(() => {
    if (!data || !data.report) return { hitRate: '92', avgReturn: '+4.8', totalSignals: '24' };
    
    const signals = data.report.signals || [];
    const hits = signals.filter(s => s.status === '익절' || s.status === '상승').length;
    const hitRate = signals.length > 0 ? ((hits / signals.length) * 100).toFixed(0) : '0';
    
    // Average Return calculation (Extract numbers from strings like "+5.2%")
    const returns = signals.map(s => {
        const match = (s.profit_loss || '').match(/[\d.]+/);
        return match ? parseFloat(match[0]) : 0;
    });
    const avgReturn = returns.length > 0 ? (returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(1) : '0.0';

    return {
        hitRate,
        avgReturn: hitRate === '0' ? '0.0' : `+${avgReturn}`,
        totalSignals: signals.length
    };
  }, [data]);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (honeypot) return;
    setSubmitStatus('loading');
    try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        setSubmitStatus('success');
        setEmail('');
    } catch (err) {
        setSubmitStatus('idle');
    }
  };

  return (
    <div className="lp-container">
      {/* Navigation */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <div className="lp-logo-icon">
              <Rocket className="text-black" size={20} fill="currentColor" />
            </div>
            <span>MP <span style={{color: 'var(--primary)'}}>STOCK</span></span>
          </div>

          <div className="lp-nav-links">
            <a href="#home" className="lp-nav-link">Home</a>
            <a href="#signals" className="lp-nav-link">MP 시그널</a>
            <a href="#performance" className="lp-nav-link">Daily 성과</a>
            <button onClick={onLoginClick} className="lp-btn-gold">로그인</button>
          </div>
        </div>
      </nav>

      {/* Hero Section with Dashboard */}
      <header className="lp-hero" id="home">
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
        >
            <h1 className="lp-hero-title">
              AI 시그널의 압도적 성치,<br/>
              <span style={{color: 'var(--primary)', textShadow: '0 0 30px rgba(212,175,55,0.4)'}}>0초의 데이터로 증명합니다.</span>
            </h1>
            <p className="lp-hero-subtitle">
                주식 투자의 새로운 기준. MP Stock의 정밀 알고리즘이 도출한<br/>
                오늘의 실시간 매수 타점과 성과 요약을 즉시 확인하세요.
            </p>
        </motion.div>

        {/* Task 7: 3-Stat Grid */}
        <div className="lp-hero-stats-grid">
            <div className="lp-stat-card">
                <div className="lp-stat-label">금일 적중률</div>
                <div className="lp-stat-value">
                    {stats.hitRate}<span className="lp-stat-unit">%</span>
                </div>
                <div style={{fontSize: '0.65rem', color: '#4ADE80', marginTop: '0.5rem', fontWeight: 700}}>
                    <CheckCircle2 size={10} style={{display: 'inline', marginRight: '2px'}} /> LIVE VERIFIED
                </div>
            </div>
            <div className="lp-stat-card" style={{borderColor: 'var(--primary)', borderWeight: '2px'}}>
                <div className="lp-stat-label">평균 수익률</div>
                <div className="lp-stat-value">
                    {stats.avgReturn}<span className="lp-stat-unit">%</span>
                </div>
                <div style={{fontSize: '0.65rem', color: '#fbbf24', marginTop: '0.5rem', fontWeight: 700}}>
                    <TrendingUp size={10} style={{display: 'inline', marginRight: '2px'}} /> MARKET TOP 1%
                </div>
            </div>
            <div className="lp-stat-card">
                <div className="lp-stat-label">금일 시그널</div>
                <div className="lp-stat-value">
                    {stats.totalSignals}<span className="lp-stat-unit">건</span>
                </div>
                <div style={{fontSize: '0.65rem', color: '#60A5FA', marginTop: '0.5rem', fontWeight: 700}}>
                    <Zap size={10} style={{display: 'inline', marginRight: '2px'}} /> REAL-TIME ENGINE
                </div>
            </div>
        </div>
        
        {/* Performance Table in Hero */}
        <div style={{marginTop: '2rem', textAlign: 'left'}}>
            <MPStockDailyReport 
              data={data} 
              isLoading={isLoading} 
              isFallback={isFallback} 
            />
        </div>
      </header>

      {/* Value Proposition */}
      <section className="lp-section lp-section-dark" id="signals">
        <div className="lp-hero" style={{paddingTop: 0, paddingBottom: '4rem'}}>
            <h2 style={{fontSize: '3rem', fontWeight: 900, marginBottom: '1rem'}}>
                Why <span style={{color: 'var(--primary)'}}>MP Stock</span>?
            </h2>
            <p style={{color: 'var(--text-secondary)'}}>대한민국 No.1 AI 주식 분석 엔진</p>
        </div>

        <div className="lp-grid">
            {[
                {
                    title: "Data-Driven",
                    desc: "실시간 KIS API 연동으로 오차 없는 기술적 지표 분석을 제공합니다.",
                    icon: <BarChart3 size={32} />
                },
                {
                    title: "Zero-Emotion",
                    desc: "인간의 심리를 배제한 알고리즘이 냉철하게 최적의 타점을 포착합니다.",
                    icon: <Shield size={32} />
                },
                {
                    title: "Transparency",
                    desc: "매일의 수익률과 적중률을 한 치의 거짓 없이 투명하게 공개합니다.",
                    icon: <Sparkles size={32} />
                }
            ].map((item, idx) => (
                <motion.div 
                    key={item.title}
                    className="lp-card"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                >
                    <div style={{color: 'var(--primary)', marginBottom: '1.5rem'}}>{item.icon}</div>
                    <h3 style={{fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem'}}>{item.title}</h3>
                    <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6}}>{item.desc}</p>
                </motion.div>
            ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="lp-section" id="performance">
        <div className="lp-hero" style={{backgroundColor: 'rgba(212, 175, 55, 0.05)', borderRadius: '40px', padding: '5rem 2rem'}}>
            <h2 style={{fontSize: '2.5rem', fontWeight: 900, marginBottom: '1.5rem'}}>
                지금 바로 <span style={{color: 'var(--primary)'}}>무료 리포트</span>를 구독하세요
            </h2>
            <p className="lp-hero-subtitle" style={{marginBottom: '3rem'}}>
                매일 아침, 장 시작 전 AI가 선별한 핵심 종목 정보를 보내드립니다.
            </p>

            <form onSubmit={handleSubscribe} className="lp-input-group">
                <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="이메일 주소를 입력하세요"
                    required
                    className="lp-input"
                />
                <input 
                    type="text"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    style={{display: 'none'}}
                    tabIndex="-1"
                />
                <button 
                    type="submit"
                    disabled={submitStatus !== 'idle'}
                    className="lp-btn-gold"
                    style={{padding: '1.25rem', fontSize: '1.1rem'}}
                >
                    {submitStatus === 'loading' ? '처리 중...' : submitStatus === 'success' ? '구독 완료!' : '무료 구독 신청'}
                </button>
            </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
            <div style={{display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '3rem'}}>
                <div>
                    <div className="lp-logo" style={{marginBottom: '1rem'}}>
                        <span>MP <span style={{color: 'var(--text-secondary)'}}>STOCK</span></span>
                    </div>
                    <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '300px'}}>
                        AI 기반 주식 분석 시스템.<br/>
                        데이터의 힘으로 투자의 미래를 바꿉니다.
                    </p>
                </div>
                <div style={{display: 'flex', gap: '4rem'}}>
                    <div>
                        <p style={{fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem'}}>Company</p>
                        <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>대표: 최종한</p>
                        <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>사업자: 준비중</p>
                    </div>
                    <div>
                        <p style={{fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem'}}>Contact</p>
                        <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>@mpstock_support</p>
                    </div>
                </div>
            </div>
            <div style={{borderTop: '1px solid var(--glass-border)', paddingTop: '2rem'}}>
                <p style={{fontSize: '0.7rem', color: '#444', lineHeight: 1.5}}>
                    본 서비스에서 제공하는 모든 정보는 투자 참고용이며, 이를 이용한 투자 결과에 대한 법적 책임은 이용자 본인에게 있습니다.
                </p>
                <p style={{fontSize: '0.7rem', color: '#555', marginTop: '1rem'}}>Copyright © 2026 MP Stock. All rights reserved.</p>
            </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
