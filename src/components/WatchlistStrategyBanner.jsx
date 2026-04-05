import React from 'react';
import { Target, AlertTriangle, ExternalLink, Zap, Star, Newspaper } from 'lucide-react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import useAuthStore from '../store/authStore';

// 뉴스/공시 링크 생성 헬퍼 (Top5StrategyBanner와 공유 로직)
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

const WatchlistStrategyBanner = () => {
    const { isAuthenticated } = useAuthStore();
    const { data, error, isLoading } = useSWR('public/watchlist-strategy', reportService.getWatchlistStrategy, {
        revalidateOnFocus: true,
        refreshInterval: 60000 
    });

    if (isLoading || error || !data || !data.stocks || data.stocks.length === 0) return null;

    return (
        <section className="watchlist-banner-wrap" style={{ margin: '2rem 0', animation: 'fadeInUp 0.8s ease-out' }}>
            {/* 헤더 - Top5와 동일한 구조 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ backgroundColor: '#EF4444', color: '#fff', padding: '0.4rem', borderRadius: '8px' }}>
                    <Star size={20} fill="currentColor" />
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                    오늘의 <span style={{ color: '#EF4444' }}>관심 종목</span> 매매 전략
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
                    관리자 추천: woo4245
                </span>
            </div>

            {/* 카드 그리드 - Top5와 완전히 동일한 구조 (단일 품목 시 stretch 방지 위해 auto-fill 사용) */}
            <div className="strategy-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 350px))', gap: '1.5rem' }}>
                {data.stocks.map((stock, idx) => {
                    const infoLinks = getInfoLinks(stock.code, stock.name);
                    return (
                        <div key={stock.code} className="watchlist-strategy-card" style={{
                            backgroundColor: 'rgba(239,68,68,0.03)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: '20px',
                            padding: '1.5rem',
                            transition: 'all 0.3s ease',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {/* 순위 + 이름 + 점수 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <span style={{ color: '#EF4444', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>PICK {idx+1}</span>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '0.25rem 0' }}>{stock.name}</h3>
                                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{stock.code}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#EF4444' }}>{stock.score}<span style={{ fontSize: '0.8rem' }}>점</span></div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>PREMIUM PICK</div>
                                </div>
                            </div>

                            {/* 매매 전략 수치 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Zap size={14} /> 1차매수진입가
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice1 || stock.entryPrice || 0).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Zap size={14} /> 2차매수진입가
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice2 || 0).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Target size={14} /> 목표가
                                    </span>
                                    <span style={{ color: '#ff4d4d', fontWeight: 700 }}>{Math.round(stock.targetPrice || 0).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AlertTriangle size={14} /> 손절가
                                    </span>
                                    <span style={{ color: '#4da6ff', fontWeight: 700 }}>{Math.round(stock.stopLoss || 0).toLocaleString()}원</span>
                                </div>
                            </div>

                            {/* 실시간 차트 보기 */}
                            <a 
                                href={`https://kr.tradingview.com/chart/?symbol=KRX:${stock.code}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-chart-link-watchlist"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'rgba(239,68,68,0.1)',
                                    color: '#EF4444',
                                    textDecoration: 'none',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    transition: 'all 0.2s ease',
                                    marginBottom: '0.75rem'
                                }}
                            >
                                실시간 차트 보기 <ExternalLink size={14} />
                            </a>

                            {/* 뉴스 & 공시 링크 박스 - Top5와 동일 */}
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
                .watchlist-strategy-card:hover {
                    transform: translateY(-5px);
                    background-color: rgba(239,68,68,0.06);
                    border-color: #EF4444;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .btn-chart-link-watchlist:hover {
                    background-color: #EF4444;
                    color: #fff;
                }
                .info-link-btn:hover {
                    background-color: rgba(255,255,255,0.08) !important;
                    transform: translateY(-1px);
                }
            `}} />
        </section>
    );
};

export default WatchlistStrategyBanner;
