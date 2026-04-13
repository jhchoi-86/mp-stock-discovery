import React from 'react';
// import { motion } from 'framer-motion';

import { Menu, X, Rocket, Shield, BarChart3, Sparkles, TrendingUp, CheckCircle, Smartphone, Activity, Share2, LogIn, ChevronRight, Play, Zap, Bell, CheckCircle2 } from 'lucide-react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import Top5StrategyBanner from './Top5StrategyBanner';
import LandingHeader from './LandingHeader';
import { useSSE } from '../hooks/useSSE';

const SocialMarquee = ({ notifications = [] }) => {
  return (
    <div className="lp-section" style={{padding: '2rem 0', backgroundColor: '#0d0d0d', borderBottom: '1px solid var(--glass-border)'}}>
      <div style={{maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '2rem'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 800, whiteSpace: 'nowrap'}}>
            <Bell size={18} /> LIVE SIGNAL
        </div>
        <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
            <div className="animate-marquee" style={{display: 'flex', gap: '4rem'}}>
                {[...notifications, ...notifications].map((item, idx) => (
                    <span key={idx} style={{color: '#fff', fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap'}}>
                        {item.message}
                    </span>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

const LandingPage = ({ onLoginClick, isAuthenticated, onLogoutClick }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [honeypot, setHoneypot] = React.useState('');
  const [submitStatus, setSubmitStatus] = React.useState('idle');
  
  const { data, error, isLoading } = useSWR('reports/latest', reportService.getLatestReport, {
    revalidateOnFocus: true,
    refreshInterval: 3000
  });

  const { data: swrNotifications } = useSWR('public/live-notifications', reportService.getLiveNotifications, {
    revalidateOnFocus: true,
    refreshInterval: 30000 
  });

  const { notifications: sseNotifications } = useSSE();
  
  // Combine SSE and SWR (SSE takes priority for real-time, SWR for initial load)
  const notifications = React.useMemo(() => {
    if (sseNotifications && sseNotifications.length > 0) return sseNotifications;
    return swrNotifications || [];
  }, [sseNotifications, swrNotifications]);

  const stats = React.useMemo(() => {
    if (!data || !data.stocks) return { hitRate: '---', avgReturn: '0.0', totalSignals: '0' };
    const stocks = data.stocks || [];
    const executedStocks = stocks.filter(s => s.status === '체결' || s.status === 'EXECUTED');
    const hits = executedStocks.length;
    const hitRate = stocks.length > 0 ? ((hits / stocks.length) * 100).toFixed(0) : '0';
    const returns = executedStocks.map(s => s.yield_pct || 0);
    const avgVal = returns.length > 0 ? (returns.reduce((a, b) => a + b, 0) / returns.length) : 0;
    const avgReturn = (avgVal >= 0 ? "+" : "") + avgVal.toFixed(1);
    return { hitRate, avgReturn, totalSignals: stocks.length };
  }, [data]);

  const dynamicAlerts = React.useMemo(() => {
    if (notifications && notifications.length > 0) return notifications;
    if (data && data.stocks && data.stocks.length > 0) {
        return [
            ...data.stocks.slice(0, 3).map(s => ({ 
                message: `[성과확인] ${s.name} ${(s.yield_pct || 0) > 0 ? '+' : ''}${s.yield_pct || '0.0'}% 수익률 기록 중` 
            })),
            { message: "[VIP] 일일 리서치 리포트 및 매매 타점 발송 완료" }
        ];
    }
    return [
        { message: "[알림] 실시간 매매 신호 엔진 가동 중..." },
        { message: "[정보] KOSPI 200 & KOSDAQ 150 주도주 정밀 분석 완료" },
        { message: "[VIP] 일일 리서치 리포트 발송 완료" }
    ];
  }, [notifications, data]);

  return (
    <div className="lp-premium-wrap">
      <div className="lp-container">
      {/* Navigation */}
      <LandingHeader 
        isAuthenticated={isAuthenticated} 
        onLogoutClick={onLogoutClick} 
        onLoginClick={onLoginClick} 
      />

      {/* Value Proposition */}
      <section className="lp-section lp-section-dark" id="signals">
        <div className="lp-hero" style={{paddingTop: '4rem', paddingBottom: '4rem'}}>
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
                <div 
                    key={idx}
                    className="lp-card"
                >
                    <div style={{color: 'var(--primary)', marginBottom: '1.5rem'}}>{item.icon}</div>
                    <h3 style={{fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', lineHeight: 1.4}}>{item.title}</h3>
                    <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7}}>{item.desc}</p>
                </div>
            ))}
        </div>
      </section>

      {/* Social Proof Marquee */}
      <section>
        <div className="lp-hero" style={{padding: '2rem 0 1rem 0'}}>
            <h2 style={{fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem'}}>
                지금 이 순간에도 <span style={{color: 'var(--primary)'}}>AI는 기회를 포착</span>하고 있습니다.
            </h2>
        </div>
        <SocialMarquee notifications={dynamicAlerts} />
      </section>

      <Top5StrategyBanner onLoginClick={onLoginClick} />

      <header className="lp-hero" id="home">
        <div style={{textAlign: 'center', width: '100%'}}>
            <h1 className="lp-hero-title" style={{fontSize: '2.5rem', fontWeight: 900}}>
              감정이 배제된 AI의 정확한 타점,<br/>
              <span style={{color: 'var(--primary)', textShadow: '0 0 30px rgba(212,175,55,0.4)'}}>매일 결과로 증명합니다.</span>
            </h1>
            <p className="lp-hero-subtitle">
                KOSPI 200 & KOSDAQ 150 주도주 중심, 매일 업데이트되는<br/>
                5종목의 놀라운 승률을 지금 바로 확인하세요.
            </p>
        </div>

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
      </header>

      {/* CTA Section */}
      <section className="lp-section" id="subscribe">
        <div className="lp-hero" style={{background: 'linear-gradient(to bottom, rgba(212, 212, 212, 0.05), rgba(0,0,0,0))', borderRadius: '40px', padding: '5rem 2rem'}}>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '4rem', justifyContent: 'center', alignItems: 'stretch'}}>
                <div style={{flex: '1', minWidth: '320px', maxWidth: '480px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
                    <h2 style={{fontSize: '2rem', fontWeight: 900, marginBottom: '2rem', lineHeight: 1.4}}>
                        무료 회원 가입하고 <br/>
                        <span style={{color: 'var(--primary)'}}>내일의 급등주, 장 시작 전 무료</span>로 <br/>
                        일주일 동안 받아 보세요.
                    </h2>
                    <button 
                        onClick={onLoginClick} 
                        className="lp-btn-gold" 
                        style={{width: '100%', padding: '1.25rem', fontSize: '1.25rem', fontWeight: 800}}
                    >
                        무료 회원 가입
                    </button>
                </div>

                <div style={{flex: '1', minWidth: '320px', maxWidth: '480px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'center'}}>
                    <h2 style={{fontSize: '2rem', fontWeight: 900, marginBottom: '2rem', lineHeight: 1.4}}>
                        남들보다 한 발 앞선 타이밍,<br/><span style={{color: '#fff'}}>VIP 멤버십으로 시작하세요.</span>
                    </h2>
                    <button className="lp-btn-gold" style={{width: '100%', padding: '1.25rem', fontSize: '1.25rem', fontWeight: 800, boxShadow: '0 0 40px rgba(212,175,55,0.4)'}}>
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
                        <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>연락처: jonghanchoi.86@gmail.com</p>
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
  </div>
  );
};

export default LandingPage;
