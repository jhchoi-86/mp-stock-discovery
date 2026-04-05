import React from 'react';
import { Target, TrendingUp, AlertTriangle, ExternalLink, Zap, Award, Lock, Newspaper, FileText, BarChart2 } from 'lucide-react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import useAuthStore from '../store/authStore';

// 뉴스/공시 링크 생성 헬퍼
const getInfoLinks = (code, name) => [
    {
        label: '네이버 뉴스',
        icon: '📰',
        url: `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(name)}+주식`,
        color: '#00c73c'
    },
    {
        label: 'KIND 공시',
        icon: '📋',
        url: `https://kind.krx.co.kr/disclosure/details.do?method=searchDetailsMain&searchCompany=${code}`,
        color: '#4da6ff'
    },
    {
        label: 'Dart 공시',
        icon: '📝',
        url: `https://finance.naver.com/item/news_notice.naver?code=${code}`,
        color: '#ff9f43'
    },
    {
        label: '네이버 종목',
        icon: '📈',
        url: `https://finance.naver.com/item/main.naver?code=${code}`,
        color: '#d4af37'
    }
];

const Top5StrategyBanner = ({ onLoginClick }) => {
    const { isAuthenticated } = useAuthStore();
    const { data, error, isLoading } = useSWR(isAuthenticated ? 'public/top5-strategy' : null, reportService.getTop5Strategy, {
        revalidateOnFocus: true,
        refreshInterval: 60000 
    });

    if (isLoading) return (
        <div className="strategy-banner-skeleton" style={{ height: '200px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '20px', margin: '2rem 0' }}></div>
    );

    // [v3.9.6] 비회원 유도 UI
    if (!isAuthenticated) return (
        <section className="strategy-banner-wrap" style={{ margin: '3rem 0', animation: 'fadeInUp 0.8s ease-out' }}>
            <div style={{ 
                backgroundColor: 'rgba(212,175,55,0.05)', 
                border: '2px dashed rgba(212,175,55,0.3)', 
                borderRadius: '24px', 
                padding: '3rem 2rem',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1 }}>
                    <Award size={200} color="var(--primary)" />
                </div>
                
                <Lock size={48} color="var(--primary)" style={{ marginBottom: '1.5rem' }} />
                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', marginBottom: '1rem' }}>
                    오늘의 추천 종목 <span style={{ color: 'var(--primary)' }}>매매 전략 (Locked)</span>
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', maxWidth: '600px', margin: '0 auto 2rem', lineHeight: 1.6 }}>
                    현재 시장 주도주 5종목의 정밀 매수 타점과 목표가가 분석되었습니다.<br/>
                    회원가입 후 AI가 제안하는 승률 높은 트레이딩 시나리오를 만나보세요.
                </p>
                
                <button 
                    onClick={() => onLoginClick && onLoginClick()}
                    style={{
                        padding: '1rem 2.5rem',
                        backgroundColor: 'var(--primary)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '1rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 10px 20px rgba(212,175,55,0.2)',
                        transition: 'all 0.3s ease'
                    }}
                >
                    지금 로그인하고 전략 확인하기
                </button>
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </section>
    );

    if (error || !data || !data.stocks) return null;

    return (
        <section className="strategy-banner-wrap" style={{ margin: '3rem 0', animation: 'fadeInUp 0.8s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ backgroundColor: 'var(--primary)', color: '#000', padding: '0.4rem', borderRadius: '8px' }}>
                    <Award size={20} />
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                    오늘의 추천 종목 <span style={{ color: 'var(--primary)' }}>매매 전략</span>
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
                    Last Update: {new Date(data.updatedAt).toLocaleTimeString()}
                </span>
            </div>

            <div className="strategy-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {data.stocks.map((stock, idx) => {
                    const infoLinks = getInfoLinks(stock.code, stock.name);
                    return (
                        <div key={stock.code} className="strategy-card" style={{
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(212,175,55,0.2)',
                            borderRadius: '20px',
                            padding: '1.5rem',
                            transition: 'all 0.3s ease',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {/* 순위 + 이름 + 점수 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <span style={{ color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{idx+1}위</span>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '0.25rem 0' }}>{stock.name}</h3>
                                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{stock.code}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)' }}>{stock.score}<span style={{ fontSize: '0.8rem' }}>점</span></div>
                                    <div style={{ fontSize: '0.7rem', color: '#4ADE80', fontWeight: 700 }}>HYBRID SCORE</div>
                                </div>
                            </div>

                            {/* 매매 전략 수치 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Zap size={14} className="text-yellow-500" /> 1차 매수진입가(2H)
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice1 || stock.entryPrice).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Zap size={14} className="text-yellow-500" /> 2차 매수진입가
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice2).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Target size={14} className="text-blue-400" /> 목표가
                                    </span>
                                    <span style={{ color: '#ff4d4d', fontWeight: 700 }}>
                                        {Math.round(stock.targetPrice).toLocaleString()}원
                                        {stock.targetPrice2 ? ` / ${Math.round(stock.targetPrice2).toLocaleString()}원` : ''}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AlertTriangle size={14} className="text-red-400" /> 손절가
                                    </span>
                                    <span style={{ color: '#4da6ff', fontWeight: 700 }}>{Math.round(stock.stopLoss).toLocaleString()}원</span>
                                </div>
                            </div>

                            {/* 실시간 차트 보기 */}
                            <a 
                                href={`https://kr.tradingview.com/chart/?symbol=KRX:${stock.code}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-chart-link"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'rgba(212,175,55,0.1)',
                                    color: 'var(--primary)',
                                    textDecoration: 'none',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    border: '1px solid rgba(212,175,55,0.3)',
                                    transition: 'all 0.2s ease',
                                    marginBottom: '0.75rem'
                                }}
                            >
                                실시간 차트 보기 <ExternalLink size={14} />
                            </a>

                            {/* 뉴스 & 공시 링크 박스 */}
                            <div style={{
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '12px',
                                padding: '0.75rem',
                            }}>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Newspaper size={11} /> 최신 뉴스 · 공시 확인
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                    {infoLinks.map(link => (
                                        <a
                                            key={link.label}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                padding: '0.45rem 0.6rem',
                                                backgroundColor: 'rgba(255,255,255,0.04)',
                                                border: `1px solid ${link.color}33`,
                                                borderRadius: '8px',
                                                fontSize: '0.75rem',
                                                color: link.color,
                                                fontWeight: 600,
                                                textDecoration: 'none',
                                                transition: 'all 0.2s',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                            className="info-link-btn"
                                        >
                                            <span>{link.icon}</span>
                                            {link.label}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .strategy-card:hover {
                    transform: translateY(-5px);
                    background-color: rgba(255,255,255,0.06);
                    border-color: var(--primary);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .btn-chart-link:hover {
                    background-color: var(--primary);
                    color: #000;
                }
                .info-link-btn:hover {
                    background-color: rgba(255,255,255,0.08) !important;
                    transform: translateY(-1px);
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </section>
    );
};

export default Top5StrategyBanner;
