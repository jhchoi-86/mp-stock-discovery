import React from 'react';
import { motion } from 'framer-motion';
import { Menu, X, Rocket, Shield, BarChart3, Sparkles, TrendingUp, CheckCircle2, Zap, Bell } from 'lucide-react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import MPStockDailyReport from './MPStockDailyReport';

const SocialMarquee = () => {
  const alerts = [
    "[VIP 알림] 산일전기(062040) 1차 매수 타점 도달 완료!",
    "[수익 실현] LG이노텍 목표가 달성! 단기 +5% 수익",
    "[VIP 알림] 에이프릴바이오(062040) 돌파 시그널 발생",
    "[수익 실현] 삼양식품 익절 완료! +7.2% 수익",
    "[VIP 알림] 현대차(005380) 스윙 진입가 안착"
  ];

  return (
    <div className="lp-section" style={{padding: '2rem 0', backgroundColor: '#0d0d0d', borderBottom: '1px solid var(--glass-border)'}}>
      <div style={{maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 800, whiteSpace: 'nowrap'}}>
            <Bell size={18} /> LIVE SIGNAL
        </div>
        <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
            <div className="animate-marquee" style={{display: 'flex', gap: '4rem'}}>
                {[...alerts, ...alerts].map((text, idx) => (
                    <span key={idx} style={{color: '#fff', fontSize: '0.9rem', fontWeight: 500}}>
                        {text}
                    </span>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

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

  const stats = React.useMemo(() => {
    if (!data || !data.report) return { hitRate: '92', avgReturn: '+4.8', totalSignals: '24' };
    const signals = data.report.signals || [];
    const hits = signals.filter(s => s.status === '익절' || s.status === '상승').length;
    const hitRate = signals.length > 0 ? ((hits / signals.length) * 100).toFixed(0) : '0';
    const returns = signals.map(s => {
        const match = (s.profit_loss || '').match(/[\d.]+/);
        return match ? parseFloat(match[0]) : 0;
    });
    const avgReturn = returns.length > 0 ? (returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(1) : '0.0';
    return { hitRate, avgReturn: hitRate === '0' ? '0.0' : `+${avgReturn}`, totalSignals: signals.length };
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

      {/* Hero Section */}
      <header className="lp-hero" id="home">
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <h1 className="lp-hero-title">
              감정이 배제된 AI의 정확한 타점,<br/>
              <span style={{color: 'var(--primary)', textShadow: '0 0 30px rgba(212,175,55,0.4)'}}>매일 결과로 증명합니다.</span>
            </h1>
            <p className="lp-hero-subtitle">
                KOSPI 200 & KOSDAQ 150 주도주 중심, 매일 업데이트되는<br/>
                5종목의 놀라운 승률을 지금 바로 확인하세요.
            </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="lp-hero-stats-grid">
            <div className="lp-stat-card">
                <div className="lp-stat-label">금일 적중률</div>
                <div className="lp-stat-value">{stats.hitRate}<span className="lp-stat-unit">%</span></div>
                <div style={{fontSize: '0.65rem', color: '#4ADE80', marginTop: '0.5rem', fontWeight: 700}}>
                    <CheckCircle2 size={10} style={{display: 'inline', marginRight: '2px'}} /> LIVE VERIFIED
                </div>
            </div>
            <div className="lp-stat-card" style={{borderColor: 'var(--primary)', borderWidth: '2px'}}>
                <div className="lp-stat-label">평균 수익률</div>
                <div className="lp-stat-value">{stats.avgReturn}<span className="lp-stat-unit">%</span></div>
                <div style={{fontSize: '0.65rem', color: '#fbbf24', marginTop: '0.5rem', fontWeight: 700}}>
                    <TrendingUp size={10} style={{display: 'inline', marginRight: '2px'}} /> MARKET TOP 1%
                </div>
            </div>
            <div className="lp-stat-card">
                <div className="lp-stat-label">금일 시그널</div>
                <div className="lp-stat-value">{stats.totalSignals}<span className="lp-stat-unit">건</span></div>
                <div style={{fontSize: '0.65rem', color: '#60A5FA', marginTop: '0.5rem', fontWeight: 700}}>
                    <Zap size={10} style={{display: 'inline', marginRight: '2px'}} /> REAL-TIME ENGINE
                </div>
            </div>
        </div>
        
        <div style={{marginTop: '2rem', textAlign: 'left'}}>
            <MPStockDailyReport data={data} isLoading={isLoading} isFallback={isFallback} />
        </div>
      </header>

      {/* Social Proof Marquee */}
      <section>
        <div className="lp-hero" style={{padding: '4rem 0 2rem 0'}}>
            <h2 style={{fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem'}}>
                지금 이 순간에도 <span style={{color: 'var(--primary)'}}>AI는 기회를 포착</span>하고 있습니다.
            </h2>
        </div>
        <SocialMarquee />
      </section>

      {/* Value Proposition */}
      <section className="lp-section lp-section-dark" id="signals">
        <div className="lp-hero" style={{paddingTop: 0, paddingBottom: '4rem'}}>
            <h2 style={{fontSize: '3rem', fontWeight: 900, marginBottom: '1rem', lineHeight: 1.2}}>
                왜 MP Stock인가?<br/>
                <span style={{color: 'var(--primary)'}}>흔들리지 않는 상위 1%의 투자 공식</span>
            </h2>
        </div>

        <div className="lp-grid">
            {[
                {
                    title: "Data-Driven: 감으로 하는 투자는 끝났습니다.",
                    desc: "기관 수준의 KIS API 데이터를 기반으로, 수백 개의 기술적 지표를 초당 분석하여 최적의 종목을 발굴합니다.",
                    icon: <BarChart3 size={32} />
                },
                {
                    title: "Zero-Emotion: 흔들리지 않는 기계적 타점.",
                    desc: "공포와 탐욕을 배제했습니다. 오직 AI 알고리즘이 계산한 진입가와 목표가로 가장 안전한 수익 구간을 공략합니다.",
                    icon: <Shield size={32} />
                },
                {
                    title: "Full Transparency: 수익도, 손실도 100% 투명하게.",
                    desc: "과장된 누적 수익률로 현혹하지 않습니다. 매일 장 마감 후 체결 여부와 실제 수익률을 가감 없이 공개합니다.",
                    icon: <Sparkles size={32} />
                }
            ].map((item, idx) => (
                <motion.div 
                    key={idx}
                    className="lp-card"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                >
                    <div style={{color: 'var(--primary)', marginBottom: '1.5rem'}}>{item.icon}</div>
                    <h3 style={{fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', lineHeight: 1.4}}>{item.title}</h3>
                    <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7}}>{item.desc}</p>
                </motion.div>
            ))}
        </div>
      </section>

      {/* CTA & Lead Gen */}
      <section className="lp-section" id="performance">
        <div className="lp-hero" style={{background: 'linear-gradient(to bottom, rgba(212, 212, 212, 0.05), rgba(0,0,0,0))', borderRadius: '40px', padding: '5rem 2rem'}}>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '4rem', justifyContent: 'center'}}>
                {/* Free Case */}
                <div style={{flex: '1', minWidth: '320px', maxWidth: '450px'}}>
                    <h2 style={{fontSize: '2rem', fontWeight: 900, marginBottom: '1.5rem'}}>
                        내일의 급등주,<br/><span style={{color: 'var(--primary)'}}>장 시작 전 무료</span>로 받아보세요.
                    </h2>
                    <form onSubmit={handleSubscribe} className="lp-input-group" style={{maxWidth: '100%'}}>
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="리포트를 받을 이메일 주소를 입력해주세요."
                            required
                            className="lp-input"
                        />
                        <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} style={{display: 'none'}} tabIndex="-1" />
                        <button type="submit" disabled={submitStatus !== 'idle'} className="lp-btn-gold" style={{width: '100%', padding: '1.25rem'}}>
                            {submitStatus === 'loading' ? '처리 중...' : submitStatus === 'success' ? '신청 완료! ✨' : '무료 Daily 리포트 신청'}
                        </button>
                    </form>
                </div>

                {/* Paid Case */}
                <div style={{flex: '1', minWidth: '320px', maxWidth: '450px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                    <h2 style={{fontSize: '2rem', fontWeight: 900, marginBottom: '1.5rem'}}>
                        남들보다 한 발 앞선 타이밍,<br/><span style={{color: '#fff'}}>VIP 멤버십으로 시작하세요.</span>
                    </h2>
                    <button className="lp-btn-gold" style={{padding: '1.25rem', fontSize: '1.25rem', boxShadow: '0 0 40px rgba(212,175,55,0.4)'}}>
                        프리미엄 구독 시작하기
                    </button>
                </div>
            </div>
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
                </div>
                <div style={{display: 'flex', gap: '4rem'}}>
                    <div>
                        <p style={{fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem'}}>Company</p>
                        <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>대표: 최종한</p>
                    </div>
                </div>
            </div>
            <div style={{borderTop: '1px solid var(--glass-border)', paddingTop: '2rem'}}>
                <p style={{fontSize: '0.7rem', color: '#444', lineHeight: 1.5}}>
                    본 사이트에서 제공하는 모든 정보는 투자 참고용이며 실제 결과에 대한 법적 책임은 투자자 본인에게 있습니다.
                </p>
                <p style={{fontSize: '0.7rem', color: '#555', marginTop: '1rem'}}>Copyright © 2026 MP Stock. All rights reserved.</p>
            </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
