import React, { useState, useEffect, useMemo } from 'react';
import axiosClient from '../api/axiosClient';
import { useRealtimeSignal } from '../hooks/useRealtimeSignal';
import { 
    Play, BarChart3, Target, TrendingUp, Loader2, AlertCircle, 
    CheckCircle2, Info, ShieldCheck, Zap, Activity, Clock, 
    Layers, StopCircle, Radio, History, ArrowUpRight, TrendingDown
} from 'lucide-react';

// [Phase 4] 실시간 종목 카드 컴포넌트
const RealtimeStockCard = React.memo(({ ticker, name, state, latestSignal }) => {
    const wbs1m = state?.wbs1m || 0;
    const wbs3m = state?.wbs3m || 0;
    const isActive = latestSignal && (Date.now() - new Date(latestSignal.occurredAt).getTime() < 300000); // 5분 이내 신호

    const getLevelColor = (level) => {
        if (level?.includes('STRONG')) return '#f43f5e'; // Red
        if (level?.includes('BUY')) return '#f59e0b';    // Orange
        return '#10b981';                               // Green
    };

    return (
        <div style={{
            background: isActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '28px',
            padding: '16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            flex: 1,
            minWidth: 0
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '900', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticker}</span>
                    <span style={{ fontSize: '15px', fontWeight: '900', letterSpacing: '-0.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
                <div style={{ 
                    display: 'flex', alignItems: 'center', gap: '4px', 
                    backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '100px',
                    flexShrink: 0
                }}>
                    <Radio size={12} color="#10b981" className="animate-pulse" />
                    <span style={{ fontSize: '10px', fontWeight: '900', color: '#10b981' }}>LIVE</span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
                        <span style={{ color: '#94a3b8' }}>WBS 1분</span>
                        <span style={{ color: '#fff' }}>{wbs1m.toFixed(1)}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${wbs1m}%`, backgroundColor: '#10b981', boxShadow: '0 0 10px #10b981', transition: 'width 0.8s ease' }} />
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
                        <span style={{ color: '#94a3b8' }}>WBS 3분</span>
                        <span style={{ color: '#fff' }}>{wbs3m.toFixed(1)}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${wbs3m}%`, backgroundColor: '#3b82f6', boxShadow: '0 0 10px #3b82f6', transition: 'width 0.8s ease' }} />
                    </div>
                </div>
            </div>

            {latestSignal ? (
                <div style={{ 
                    marginTop: '8px', padding: '16px', borderRadius: '20px', 
                    background: 'rgba(0,0,0,0.25)', border: `1px solid ${getLevelColor(latestSignal.signalType)}44`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '900', color: getLevelColor(latestSignal.signalType) }}>{latestSignal.signalType}</span>
                        <span style={{ fontSize: '12px', fontWeight: '900' }}>Score: {latestSignal.pScore}%</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                        <div><span style={{color:'#64748b'}}>진입</span> {latestSignal.entryPrice.toLocaleString()}</div>
                        <div><span style={{color:'#64748b'}}>목표</span> {latestSignal.targetPrice.toLocaleString()}</div>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#475569', fontSize: '12px', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '20px' }}>
                    수급 분석 대기 중...
                </div>
            )}
        </div>
    );
});

export default function BacktestReportWidget() {
    const [isRealtime, setIsRealtime] = useState(false);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [symbols, setSymbols] = useState([]);
    const [progress, setProgress] = useState(0);

    const { status, signals, tickerStates } = useRealtimeSignal(isRealtime);

    useEffect(() => {
        const fetchSymbols = async () => {
            try {
                const res = await axiosClient.get('/api/backtest/symbols');
                if (res.data.success) {
                    setSymbols(res.data.symbols.slice(0, 5));
                }
            } catch (err) {
                console.error('Failed to fetch symbols', err);
            }
        };
        fetchSymbols();
    }, []);

    const runBacktest = async () => {
        if (isRealtime) {
            setIsRealtime(false);
            return;
        }
        setLoading(true);
        setError(null);
        setProgress(0);
        
        const progInterval = setInterval(() => {
            setProgress(prev => (prev < 95 ? prev + Math.random() * 8 : prev));
        }, 400);

        try {
            const res = await axiosClient.post('/api/backtest/run');
            clearInterval(progInterval);
            setProgress(100);

            if (res.data.success) {
                setResults(res.data.metrics);
                setTimeout(() => setLoading(false), 500);
            } else {
                setError('분석 실패: ' + (res.data.error || '알 수 없는 오류'));
                setLoading(false);
            }
        } catch (err) {
            clearInterval(progInterval);
            const msg = err.response?.data?.error || err.message || '서버 통신 실패';
            setError(msg);
            setLoading(false);
        }
    };

    const getDetailedStatus = () => {
        if (status !== 'ONLINE') return status === 'CONNECTING' ? '연결 중...' : '연결 끊김';
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const kst = new Date(utc + (9 * 3600000));
        const hhmm = kst.getHours() * 100 + kst.getMinutes();

        if (hhmm >= 900 && hhmm < 1530) return 'KRX 정규장 수신 중';
        if (hhmm >= 800 && hhmm < 900) return 'ATS 프리마켓 수신 중';
        if (hhmm >= 1530 && hhmm < 1600) return 'ATS 애프터마켓 수신 중';
        if (hhmm >= 1600 && hhmm < 1800) return '시간외 단일가 수신 중';
        if (hhmm >= 1800 && hhmm < 2000) return 'ATS 야간 거래 수신 중';
        return '실시간 수신 중';
    };

    const currentStatus = {
        color: status === 'ONLINE' ? '#10b981' : (status === 'CONNECTING' ? '#f59e0b' : '#ef4444'),
        text: getDetailedStatus(),
        blink: status === 'ONLINE' || status === 'CONNECTING'
    };

    const styles = {
        container: {
            width: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(40px)',
            borderRadius: '44px',
            padding: '32px 32px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 30px 100px rgba(0,0,0,0.7)',
            position: 'relative',
            color: '#fff',
            fontFamily: "'Pretendard', sans-serif",
            transition: 'all 0.5s ease'
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '36px',
            gap: '20px'
        },
        modeButton: (active) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 32px',
            borderRadius: '24px',
            fontWeight: '900',
            fontSize: '17px',
            cursor: 'pointer',
            border: active ? '1px solid rgba(16, 185, 129, 0.5)' : 'none',
            background: active ? 'rgba(16, 185, 129, 0.1)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: active ? '#10b981' : '#fff',
            boxShadow: active ? 'none' : '0 10px 40px rgba(16, 185, 129, 0.3)',
            transition: 'all 0.4s'
        }),
        statusIndicator: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: '10px 20px',
            borderRadius: '100px',
            fontSize: '13px',
            fontWeight: 'bold',
            border: '1px solid rgba(255,255,255,0.05)'
        },
        tickerGrid: {
            display: 'flex',
            gap: '12px',
            marginBottom: '40px',
            width: '100%',
            justifyContent: 'center'
        }
    };

    return (
        <div style={styles.container}>
            <style>{`
                @keyframes blink { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
                .status-blink { animation: blink 1s infinite ease-in-out; }
                ::-webkit-scrollbar { display: none; }
            `}</style>

            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ backgroundColor: isRealtime ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)', padding: '12px', borderRadius: '16px' }}>
                        {isRealtime ? <Radio size={28} color="#10b981" /> : <Layers size={28} color="#3b82f6" />}
                    </div>
                    <div>
                        <h2 style={{ fontSize: '30px', fontWeight: '900', margin: 0 }}>
                            {isRealtime ? '실시간 ' : '전략 성능 '} <span style={{ color: isRealtime ? '#10b981' : '#3b82f6' }}>{isRealtime ? '수급 모니터링' : '교차 검증 리포트'}</span>
                            <span style={{ fontSize: '10px', color: '#475569', marginLeft: '10px', verticalAlign: 'middle' }}>v9.1.2</span>
                        </h2>
                        {isRealtime && (
                            <div style={styles.statusIndicator}>
                                <div style={{ 
                                    width: '10px', height: '10px', backgroundColor: currentStatus.color, 
                                    borderRadius: '50%', boxShadow: `0 0 10px ${currentStatus.color}`
                                }} className={currentStatus.blink ? 'status-blink' : ''} />
                                <span style={{ color: currentStatus.color }}>{currentStatus.text}</span>
                            </div>
                        )}
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => setIsRealtime(!isRealtime)} 
                        style={styles.modeButton(isRealtime)}
                    >
                        {isRealtime ? <><StopCircle size={20} /> <span>모니터링 정지</span></> : <><Radio size={20} /> <span>실시간 모드 전환</span></>}
                    </button>
                    {!isRealtime && (
                        <button onClick={runBacktest} disabled={loading} style={{ ...styles.modeButton(false), background: '#3b82f6' }}>
                            {loading ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
                            <span>검증 시작</span>
                        </button>
                    )}
                </div>
            </div>

            {isRealtime ? (
                <>
                    <div style={styles.tickerGrid}>
                        {symbols.map(sym => (
                            <RealtimeStockCard 
                                key={sym.code} 
                                ticker={sym.code} 
                                name={sym.name} 
                                state={tickerStates[sym.code]}
                                latestSignal={signals.find(s => s.stockCode === sym.code)}
                            />
                        ))}
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <History size={18} color="#94a3b8" />
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#94a3b8' }}>최근 발생 신호 (History)</h4>
                        </div>
                        <div style={{ 
                            background: 'rgba(0,0,0,0.2)', borderRadius: '24px', 
                            border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' 
                        }}>
                            {signals.length > 0 ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <th style={{ padding: '16px 24px', color: '#64748b' }}>시각</th>
                                            <th style={{ padding: '16px 24px', color: '#64748b' }}>종목</th>
                                            <th style={{ padding: '16px 24px', color: '#64748b' }}>신호유형</th>
                                            <th style={{ padding: '16px 24px', color: '#64748b' }}>P-Score</th>
                                            <th style={{ padding: '16px 24px', color: '#64748b' }}>기대 ROI</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {signals.slice(0, 5).map((sig, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '14px 24px', color: '#94a3b8' }}>{new Date(sig.occurredAt).toLocaleTimeString()}</td>
                                                <td style={{ padding: '14px 24px', fontWeight: 'bold' }}>{sig.stockName}</td>
                                                <td style={{ padding: '14px 24px' }}>
                                                    <span style={{ 
                                                        color: sig.signalType.includes('STRONG') ? '#f43f5e' : '#10b981',
                                                        backgroundColor: sig.signalType.includes('STRONG') ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
                                                        padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '900'
                                                    }}>
                                                        {sig.signalType}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 24px', fontWeight: 'bold' }}>{sig.pScore}%</td>
                                                <td style={{ padding: '14px 24px', color: '#10b981', fontWeight: 'bold' }}>+{sig.predictiveRoi}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>
                                    <Activity size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                    <p style={{ margin: 0 }}>발생된 매수 신호가 없습니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '10px', marginBottom: '30px', overflow: 'hidden', display: loading ? 'block' : 'none', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${progress}%`, backgroundColor: '#3b82f6', boxShadow: '0 0 15px #3b82f6', transition: 'width 0.4s ease-out' }} />
                    </div>

                    {results && (
                        <>
                            <div style={{ display: 'flex', gap: '20px', marginBottom: '40px', flexWrap: 'wrap' }}>
                                <div style={{ flex: '2', minWidth: '200px', background: 'rgba(59, 130, 246, 0.03)', border: '1px solid rgba(59, 130, 246, 0.1)', borderRadius: '24px', padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '900', color: '#64748b' }}>백테스트 성적 (Win Rate)</span>
                                        <span style={{ fontSize: '36px', fontWeight: '900' }}>{results.win_rate.toFixed(1)}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '100px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: results ? `${results.win_rate}%` : '0%', backgroundColor: '#3b82f6', transition: 'width 1s' }} />
                                    </div>
                                </div>
                                <div style={{ 
                                    flex: '1', minWidth: '240px', background: 'rgba(255, 255, 255, 0.05)', 
                                    padding: '24px', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.1)',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                                }}>
                                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>평균 수익률 (Mean ROI)</div>
                                    <div style={{ 
                                        fontSize: '40px', fontWeight: '900', 
                                        color: results.avg_pnl >= 0 ? '#f43f5e' : '#3b82f6' 
                                    }}>
                                        {results.avg_pnl >= 0 ? '+' : ''}{results.avg_pnl?.toFixed(2)}%
                                    </div>
                                    <div style={{ color: '#475569', fontSize: '11px', marginTop: '4px' }}>종목별 평균 거래 성적</div>
                                </div>
                            </div>

                            <div style={{ 
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))', 
                                padding: '20px', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '40px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                                    <Zap size={20} color="#60a5fa" style={{ marginRight: '10px' }} />
                                    <div style={{ fontWeight: 'bold', color: '#60a5fa', fontSize: '16px' }}>AI 매매 전략 마켓 인사이트 (M-Insight)</div>
                                </div>
                                <div style={{ color: '#e2e8f0', lineHeight: '1.6', fontSize: '14px' }}>
                                    {results.win_rate >= 40 ? (
                                        <>
                                            본 매매 전략은 <span style={{ color: '#10b981', fontWeight: 'bold' }}>유의미한 승률({results.win_rate}%)</span>을 보여주고 있습니다. 
                                            수급 유입 초기에 진입하여 시세 분출 시 익절하는 패턴이 유효하며, 
                                            거래량이 급증하는 10초 윈도우 시그널을 신뢰할 수 있는 구간입니다. 
                                            <br/><strong>추천 매매법:</strong> 돌파 매매 시 3.0% 익절 라인을 기계적으로 준수하십시오.
                                        </>
                                    ) : (
                                        <>
                                            현재 시장의 변동성이 작아 <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>수익 실현 구간 도달이 다소 늦어지는 경향</span>이 있습니다.
                                            전략 보정을 위해 VWAP(거래량 가중 평균가) 이탈 시 발빠른 손절 대응이 필요하며, 
                                            추격 매수보다는 눌림목 구간에서의 분할 매수 관점이 유리해 보입니다.
                                            <br/><strong>주의 사항:</strong> 현재 가상 수급 장세에서는 익절 기준을 1.5% 내외로 짧게 잡는 것이 리스크 관리에 유리합니다.
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    <div style={{ marginTop: '30px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <ShieldCheck size={18} color="#3b82f6" />
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#3b82f6' }}>백테스트 상세 거래 내역 (Evidence)</h4>
                        </div>
                        <div style={{ 
                            background: 'rgba(0,0,0,0.2)', borderRadius: '24px', 
                            border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' 
                        }}>
                            {results?.trade_log?.length > 0 ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                                            <th style={{ padding: '14px 20px', color: '#64748b' }}>유형</th>
                                            <th style={{ padding: '14px 20px', color: '#64748b' }}>종목 (코드)</th>
                                            <th style={{ padding: '14px 20px', color: '#64748b' }}>체결가</th>
                                            <th style={{ padding: '14px 20px', color: '#64748b' }}>시각</th>
                                            <th style={{ padding: '14px 20px', color: '#64748b' }}>설명</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.trade_log.slice().reverse().map((log, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '12px 20px' }}>
                                                    <span style={{ 
                                                        color: log.type === 'ENTRY' ? '#3b82f6' : '#f43f5e',
                                                        fontWeight: 'bold'
                                                    }}>{log.type === 'ENTRY' ? '매수진입' : '매도청산'}</span>
                                                </td>
                                                <td style={{ padding: '12px 20px', fontWeight: 'bold' }}>
                                                    {log.name ? `${log.name} (${log.ticker})` : log.ticker}
                                                </td>
                                                <td style={{ padding: '12px 20px' }}>{log.price.toLocaleString()}원</td>
                                                <td style={{ padding: '12px 20px', color: '#64748b' }}>{log.time?.replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') || '--:--:--'}</td>
                                                <td style={{ padding: '12px 20px', fontSize: '11px', color: '#94a3b8' }}>
                                                  {log.type === 'ENTRY' ? '수급 돌파 시그널 포착' : '익절/손절 조건 충족'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
                                    표시할 거래 내역이 없습니다. (검증을 시작해 주세요)
                                </div>
                            )}

                            {/* WBS 핵심 매커니즘 요약 (v9.1.2 추가) */}
                            <div style={{ marginTop: '40px', padding: '32px', borderRadius: '32px', background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed rgba(59, 130, 246, 0.2)' }}>
                                <h4 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '900', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>🎯</span> WBS 미래 예측 로직 요약
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: '900', color: '#94a3b8', marginBottom: '8px' }}>01. 패턴 인지</div>
                                        <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                                            과거 급등 종목들의 거래량 폭발, 수급 강도의 '지문'을 실시간 데이터와 대조하여 포착합니다.
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: '900', color: '#94a3b8', marginBottom: '8px' }}>02. WBS 정밀 스코어링</div>
                                        <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                                            가격 변동성, 순매수 규모 등 11대 핵심 지표를 점수화하여 300점 이상일 때만 승률 높은 타점으로 판단합니다.
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: '900', color: '#94a3b8', marginBottom: '8px' }}>03. 통계적 신뢰도 검증</div>
                                        <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                                            이미 결과를 알고 있는 과거 데이터(백테스트)에 로직을 적용해보고, 그 정확도를 기반으로 미래를 예측합니다.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
