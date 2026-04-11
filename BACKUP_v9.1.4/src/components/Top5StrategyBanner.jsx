import React, { useMemo } from 'react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import useAuthStore from '../store/authStore';
// [v7.7.50] 하드코딩 데이터셋(OFFICIAL_TOP5) 제거 및 순수 DB SSOT 연동

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
    const { data: ssotData, error, isLoading } = useSWR(isAuthenticated ? 'ssot/top/5' : null, reportService.getTop5Strategy, {
        revalidateOnFocus: true,
        refreshInterval: 60000 
    });

    // [v7.7.51] Move all hooks to the top to avoid Rule of Hooks violation (#310)
    const officialTop5 = useMemo(() => {
        if (!ssotData || !ssotData.data) return [];
        return (ssotData.data || []).map(s => ({
            ...s,
            code: s.stock_code || s.code,
            name: s.stock_name || s.name,
            price: s.current_price || s.currentPrice || s.price || 0,
            score: s.score || s.star_grade || 0,
            entry1: s.entry_price_1 || s.entryPrice1 || s.entry1 || 0,
            entry2: s.entry_price_2 || s.entryPrice2 || s.entry2 || 0,
            target: s.target_price_1 || s.targetPrice1 || s.target || 0,
            sl: s.stop_loss || s.stopLoss || s.sl || 0,
            trade_amount: s.trade_amount || s.tradeAmount || 0,
            vol_ratio: s.style_tag || s.styleTag || '0%',
            foreign: s.foreign_buy || s.foreignBuy || s.foreign || '0',
            inst: s.inst_buy || s.instBuy || s.inst || '0',
            style_tag: s.styleTag || s.style_tag || '',
            ai_comment: s.aiComment || s.ai_comment || '',
            status: s.status || '분석 중'
        })).sort((a, b) => b.score - a.score); // [v8.8.30] 점수순 내림차순 정렬 강제
    }, [ssotData]);

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
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.1, transform: 'rotate(15deg)' }}>
                    <span style={{ fontSize: '200px' }}>🏆</span>
                </div>
                
                <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🔒</div>
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

    // [v7.7.50] SSOT API(DB) 데이터가 없을 경우 빈 배열 반환 (하드코딩 폴백 박멸)
    if (error || !ssotData || !ssotData.data || officialTop5.length === 0) {
        if (error) console.error('[SSOT-Banner] Fetch error:', error);
        return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.02)', borderRadius: '20px' }}>
                오늘의 추천 전략 데이터를 불러오는 중이거나 데이터가 아직 생성되지 않았습니다.
            </div>
        );
    }

    return (
        <section className="strategy-banner-wrap" style={{ margin: '3rem 0', animation: 'fadeInUp 0.8s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ backgroundColor: 'var(--primary)', color: '#000', padding: '0.4rem', borderRadius: '8px' }}>
                    🏆
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                    오늘의 추천 종목 <span style={{ color: 'var(--primary)' }}>매매 전략</span>
                </h2>
            </div>

            <div className="strategy-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {officialTop5.map((stock, idx) => {
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
                            {/* 순위 + 이름 + 현재가 + 점수 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{idx+1}위</span>
                                        {(() => {
                                            let badgeStyle = { fontSize: '0.65rem', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 800, border: '1px solid' };
                                            if (stock.status === '보유 중') badgeStyle = { ...badgeStyle, backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ADE80', borderColor: 'rgba(74,222,128,0.2)' };
                                            else if (stock.status === '목표 도달') badgeStyle = { ...badgeStyle, backgroundColor: 'rgba(251,191,36,0.1)', color: '#FBBF24', borderColor: 'rgba(251,191,36,0.2)' };
                                            else if (stock.status === '손절 완료') badgeStyle = { ...badgeStyle, backgroundColor: 'rgba(248,113,113,0.1)', color: '#F87171', borderColor: 'rgba(248,113,113,0.2)' };
                                            else badgeStyle = { ...badgeStyle, backgroundColor: 'rgba(156,163,175,0.1)', color: '#9CA3AF', borderColor: 'rgba(156,163,175,0.2)' };
                                            
                                            return <span style={badgeStyle}>{stock.status}</span>;
                                        })()}
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: '0.25rem 0' }}>{stock.name}</h3>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent)' }}>{stock.price.toLocaleString()}원</div>
                                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{stock.code}</span>
                                        {stock.style_tag && (
                                            <span style={{ 
                                                fontSize: '0.7rem', 
                                                padding: '0.1rem 0.4rem', 
                                                backgroundColor: 'rgba(74,222,128,0.1)', 
                                                color: '#4ADE80', 
                                                borderRadius: '4px', 
                                                fontWeight: 800,
                                                border: '1px solid rgba(74,222,128,0.2)'
                                            }}>
                                                {stock.style_tag}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)' }}>{stock.score}<span style={{ fontSize: '0.8rem' }}>점</span></div>
                                    <div style={{ fontSize: '0.7rem', color: '#4ADE80', fontWeight: 700 }}>HYBRID SCORE</div>
                                </div>
                            </div>

                            {/* [v8.8.24] 선정 사유 (Qualitative Reasoning) */}
                            {stock.ai_comment && (
                                <div style={{ 
                                    backgroundColor: 'rgba(212,175,55,0.05)', 
                                    padding: '0.75rem', 
                                    borderRadius: '12px', 
                                    marginBottom: '1rem',
                                    border: '1px solid rgba(212,175,55,0.1)',
                                    fontSize: '0.85rem',
                                    color: 'rgba(255,255,255,0.8)',
                                    lineHeight: 1.4
                                }}>
                                    <span style={{ fontWeight: 800, color: 'var(--primary)', marginRight: '0.4rem' }}>💡 선정 사유:</span>
                                    {stock.ai_comment}
                                </div>
                            )}

                            {/* 매매 전략 수치 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }} title="2시간(2H) 차트 분석 기준 정밀 매수 타점">
                                            ⚡ 1차 진입가(2H) ⓘ
                                        </span>
                                        <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entry1).toLocaleString()}원</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            ⚡ 2차 진입가
                                        </span>
                                        <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(stock.entry2).toLocaleString()}원</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            🎯 목표가
                                        </span>
                                        <span style={{ color: '#ff6b6b', fontWeight: 700 }}>{Math.round(stock.target).toLocaleString()}원</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            ⚠️ 손절가
                                        </span>
                                        <span style={{ color: '#4da6ff', fontWeight: 700 }}>{Math.round(stock.sl).toLocaleString()}원</span>
                                    </div>
                                
                                <div style={{ marginTop: '0.4rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {/* [v8.8.29] 수급/거래대금 UI 스타일 격상 (Premium Alignment) */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                            📊 거래량 (전일대비 %)
                                        </span>
                                        <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '0.95rem' }}>
                                            {(() => {
                                                const ratio = stock.vol_ratio || '0.00%';
                                                if (!stock.trade_amount || stock.trade_amount === '0') return '-';
                                                return `${ratio}`;
                                            })()}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                            📊 외국인 순매수(+),순매도(-)
                                        </span>
                                        <span style={{ 
                                            color: (() => {
                                                const s = String(stock.foreign);
                                                if (s.includes('+')) return '#ff6b6b';
                                                if (s.includes('-')) return '#339af0';
                                                const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
                                                return n > 0 ? '#ff6b6b' : (n < 0 ? '#339af0' : '#fff');
                                            })(), 
                                            fontWeight: 800, 
                                            fontSize: '0.95rem' 
                                        }}>
                                            {(() => {
                                                const val = String(stock.foreign);
                                                const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
                                                if (isNaN(n) || n === 0) return '0주';
                                                return (n > 0 ? '+' : '') + n.toLocaleString() + '주';
                                            })()}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                            📊 기관 순매수(+),순매도(-)
                                        </span>
                                        <span style={{ 
                                            color: (() => {
                                                const s = String(stock.inst);
                                                if (s.includes('+')) return '#ff6b6b';
                                                if (s.includes('-')) return '#339af0';
                                                const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
                                                return n > 0 ? '#ff6b6b' : (n < 0 ? '#339af0' : '#fff');
                                            })(), 
                                            fontWeight: 800, 
                                            fontSize: '0.95rem' 
                                        }}>
                                            {(() => {
                                                const val = String(stock.inst);
                                                const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
                                                if (isNaN(n) || n === 0) return '0주';
                                                return (n > 0 ? '+' : '') + n.toLocaleString() + '주';
                                            })()}
                                        </span>
                                    </div>
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
                                실시간 차트 보기 🔗
                            </a>

                            {/* 뉴스 & 공시 링크 박스 */}
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
