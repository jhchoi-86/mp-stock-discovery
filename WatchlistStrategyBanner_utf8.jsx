import React from 'react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import useAuthStore from '../store/authStore';

// ?댁뒪/怨듭떆 留곹겕 ?앹꽦 ?ы띁 (Top5StrategyBanner? 怨듭쑀 濡쒖쭅)
const getInfoLinks = (code, name) => [
    {
        label: '?ㅼ씠踰??댁뒪',
        icon: '?벐',
        url: `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(name)}+二쇱떇`,
        color: '#00c73c'
    },
    {
        label: 'KIND 怨듭떆',
        icon: '?뱥',
        url: `https://kind.krx.co.kr/disclosure/details.do?method=searchDetailsMain&searchCompany=${code}`,
        color: '#4da6ff'
    },
    {
        label: 'Dart 怨듭떆',
        icon: '?뱷',
        url: `https://finance.naver.com/item/news_notice.naver?code=${code}`,
        color: '#ff9f43'
    },
    {
        label: '?ㅼ씠踰?醫낅ぉ',
        icon: '?뱢',
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

    // [v7.7.42] USER 怨듭씤 愿?ъ쥌紐?(SK?대끂踰좎씠??096770) - 以묐났 ?쒓굅 諛??곗씠??蹂닿컯
    const officialWatchlist = [
        {
            code: "096770",
            name: "SK?대끂踰좎씠??,
            score: 3,
            price: 118200,
            entryPrice1: 114400,
            entryPrice2: 108600,
            targetPrice: 119062,
            stopLoss: 106428,
            foreign: "+4,520",
            inst: "+12,850",
            volume: "利앷?"
        }
    ];

    return (
        <section className="watchlist-banner-wrap" style={{ margin: '2rem 0', animation: 'fadeInUp 0.8s ease-out', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1, transform: 'rotate(15deg)' }}>
                    <span style={{ fontSize: '200px' }}>?룇</span>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                    ?ㅻ뒛??<span style={{ color: '#EF4444' }}>愿??醫낅ぉ</span> 留ㅻℓ ?꾨왂
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
                            {/* ?쒖쐞 + ?대쫫 + ?꾩옱媛 + ?먯닔 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <span style={{ color: '#EF4444', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>PICK {idx+1}</span>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '0.25rem 0' }}>{stock.name}</h3>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#FFD700' }}>{stock.price.toLocaleString()}??/div>
                                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{stock.code}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#EF4444' }}>{stock.score}<span style={{ fontSize: '0.8rem' }}>??/span></div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>PREMIUM PICK</div>
                                </div>
                            </div>

                            {/* 留ㅻℓ ?꾨왂 ?섏튂 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ??1李⑤ℓ?섏쭊?낃?
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice1 || 0).toLocaleString()}??/span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ??2李⑤ℓ?섏쭊?낃?
                                    </span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entryPrice2 || 0).toLocaleString()}??/span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ?렞 紐⑺몴媛
                                    </span>
                                    <span style={{ color: '#ff4d4d', fontWeight: 700 }}>{Math.round(stock.targetPrice || 0).toLocaleString()}??/span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ?좑툘 ?먯젅媛
                                    </span>
                                    <span style={{ color: '#4da6ff', fontWeight: 700 }}>{Math.round(stock.stopLoss || 0).toLocaleString()}??/span>
                                </div>

                                {/* v7.7.41 ?섍툒 諛?嫄곕옒???곗씠??異붽? */}
                                <div style={{ marginTop: '0.4rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            ?뱤 嫄곕옒??(?꾩씪 ?鍮?
                                        </span>
                                        <span style={{ color: stock.volume === '利앷?' ? '#ff6b6b' : '#339af0', fontWeight: 700 }}>{stock.volume}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            ?뱤 {stock.foreign.startsWith('-') ? '?멸뎅???쒕ℓ?? : '?멸뎅???쒕ℓ??}
                                        </span>
                                        <span style={{ color: stock.foreign.includes('+') ? '#ff6b6b' : (stock.foreign.includes('-') ? '#339af0' : '#fff'), fontWeight: 600 }}>{stock.foreign}{stock.foreign.endsWith('二?) ? '' : '二?}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            ?뱤 {stock.inst.startsWith('-') ? '湲곌? ?쒕ℓ?? : '湲곌? ?쒕ℓ??}
                                        </span>
                                        <span style={{ color: stock.inst.includes('+') ? '#ff6b6b' : (stock.inst.includes('-') ? '#339af0' : '#fff'), fontWeight: 600 }}>{stock.inst}{stock.inst.endsWith('二?) ? '' : '二?}</span>
                                    </div>
                                </div>
                            </div>

                            {/* ?ㅼ떆媛?李⑦듃 蹂닿린 */}
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
                                ?ㅼ떆媛?李⑦듃 蹂닿린 ?뵕
                            </a>

                            {/* ?댁뒪 & 怨듭떆 留곹겕 諛뺤뒪 - Top5? ?숈씪 */}
                            <div style={{
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '12px',
                                padding: '0.75rem',
                            }}>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    ?벐 理쒖떊 ?댁뒪 쨌 怨듭떆 ?뺤씤
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
