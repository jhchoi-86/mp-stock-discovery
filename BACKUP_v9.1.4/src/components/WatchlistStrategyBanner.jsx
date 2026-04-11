import React from 'react';
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

    // [v7.7.42] USER 공인 관심종목 (SK이노베이션 096770) - 중복 제거 및 데이터 보강
    const officialWatchlist = [
        {
            code: "096770",
            name: "SK이노베이션",
            score: 3,
            price: 118200,
            entryPrice1: 114400,
            entryPrice2: 108600,
            targetPrice: 119062,
            stopLoss: 106428,
            foreign: "+4,520",
            inst: "+12,850",
            volume: "증가"
        }
    ];

    return (
        <section className="watchlist-banner-wrap" style={{ margin: '2rem 0', animation: 'fadeInUp 0.8s ease-out', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1, transform: 'rotate(15deg)' }}>
                    <span style={{ fontSize: '200px' }}>🏆</span>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                    오늘의 <span style={{ color: '#EF4444' }}>관심 종목</span> 매매 전략
                </h2>
            </div>

            <div className="strategy-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 400px))', gap: '1.5rem' }}>
                {officialWatchlist.map((stock, idx) => {
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
                            {/* 순위 + 이름 + 현재가 + 점수 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <span style={{ color: '#EF4444', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>PICK {idx+1}</span>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '0.25rem 0' }}>{stock.name}</h3>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#FFD700' }}>{stock.price.toLocaleString()}원</div>
                                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{stock.code}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#EF4444' }}>{stock.score}<span style={{ fontSize: '0.8rem' }}>점</span></div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>PREMIUM PICK</div>
                                </div>
                            </div>

                            {/* 매매 전략 수치 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ⚡ 1차매수진입가
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice1 || 0).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ⚡ 2차매수진입가
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice2 || 0).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        🎯 목표가
                                    </span>
                                    <span style={{ color: '#ff4d4d', fontWeight: 700 }}>{Math.round(stock.targetPrice || 0).toLocaleString()}원</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ⚠️ 손절가
                                    </span>
                                    <span style={{ color: '#4da6ff', fontWeight: 700 }}>{Math.round(stock.stopLoss || 0).toLocaleString()}원</span>
                                </div>

                                {/* v7.7.41 수급 및 거래량 데이터 추가 */}
                                <div style={{ marginTop: '0.4rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 거래량 (전일 대비)
                                        </span>
                                        <span style={{ color: stock.volume === '증가' ? '#ff6b6b' : '#339af0', fontWeight: 700 }}>{stock.volume}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 {stock.foreign.startsWith('-') ? '외국인 순매도' : '외국인 순매수'}
                                        </span>
                                        <span style={{ color: stock.foreign.includes('+') ? '#ff6b6b' : (stock.foreign.includes('-') ? '#339af0' : '#fff'), fontWeight: 600 }}>{stock.foreign}{stock.foreign.endsWith('주') ? '' : '주'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 {stock.inst.startsWith('-') ? '기관 순매도' : '기관 순매수'}
                                        </span>
                                        <span style={{ color: stock.inst.includes('+') ? '#ff6b6b' : (stock.inst.includes('-') ? '#339af0' : '#fff'), fontWeight: 600 }}>{stock.inst}{stock.inst.endsWith('주') ? '' : '주'}</span>
                                    </div>
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
                                실시간 차트 보기 🔗
                            </a>

                            {/* 뉴스 & 공시 링크 박스 - Top5와 동일 */}
                            <div style={{
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '12px',
                                padding: '0.75rem',
                            }}>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    📰 최신 뉴스 · 공시 확인
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
