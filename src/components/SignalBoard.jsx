import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import axiosClient from '../api/axiosClient';
import reportService from '../api/reportService';
import { Activity, Clock, CheckCircle2, Zap, Calendar } from 'lucide-react';

const fetcher = url => axiosClient.get(url).then(res => res.data);

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', 
  '15:00', '15:30'
];

const SignalBoard = () => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // [v5.0.1 RedTeam] Fixed API Consistency
    const { data: latestReport } = useSWR('reports/latest', reportService.getLatestReport);
    const { data: signalData } = useSWR('/api/public/time-slot-signals', fetcher, {
        refreshInterval: 60000 
    });

    const top5 = (latestReport?.stocks || []).slice(0, 5);

    // KST 시간 포맷팅 (YYYY-MM-DD HH:mm:ss)
    const formatKST = (date) => {
        const kstDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60000) + (9 * 3600000));
        const y = kstDate.getFullYear();
        const m = String(kstDate.getMonth() + 1).padStart(2, '0');
        const d = String(kstDate.getDate()).padStart(2, '0');
        const hh = String(kstDate.getHours()).padStart(2, '0');
        const mm = String(kstDate.getMinutes()).padStart(2, '0');
        const ss = String(kstDate.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    };

    // 현재 시간이 특정 슬롯에 해당하는지 확인 (30분 단위)
    const isCurrentSlot = (slot) => {
        const kstDate = new Date(currentTime.getTime() + (currentTime.getTimezoneOffset() * 60000) + (9 * 3600000));
        const currentHHMM = String(kstDate.getHours()).padStart(2, '0') + ':' + String(kstDate.getMinutes()).padStart(2, '0');
        
        const slotIdx = TIME_SLOTS.indexOf(slot);
        if (slotIdx === -1) return false;
        
        const nextSlot = TIME_SLOTS[slotIdx + 1] || '16:00';
        return currentHHMM >= slot && currentHHMM < nextSlot;
    };

    if (!latestReport) return <div style={{ color: '#666', textAlign: 'center', padding: '3rem' }}>대시보드 데이터를 불러오는 중...</div>;

    const renderCell = (stockCode, slot) => {
        const slotInfo = signalData?.[stockCode]?.[slot];
        const has2m = slotInfo?.tf2m;
        const has5m = slotInfo?.tf5m;

        return (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <div style={{ 
                    width: '32px', 
                    height: '24px', 
                    borderRadius: '4px', 
                    border: '1px solid var(--glass-border)',
                    backgroundColor: has2m ? 'rgba(255, 159, 67, 0.2)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease'
                }}>
                    {has2m ? <Zap size={14} color="#ff9f43" fill="#ff9f43" /> : <span style={{fontSize: '0.6rem', color: '#333'}}>2M</span>}
                </div>
                <div style={{ 
                    width: '32px', 
                    height: '24px', 
                    borderRadius: '4px', 
                    border: '1px solid var(--glass-border)',
                    backgroundColor: has5m ? 'rgba(212, 175, 55, 0.2)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease'
                }}>
                    {has5m ? <CheckCircle2 size={14} color="var(--primary)" fill="var(--primary)" /> : <span style={{fontSize: '0.6rem', color: '#333'}}>5M</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="signal-board-container card" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(212, 175, 55, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity color="var(--primary)" size={24} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Daily 실시간 매매 신호현황</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>오늘의 TOP 5 추천 종목 | 절대신호(Strong) 포착 이력</p>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '0.9rem', fontWeight: 700 }}>
                        <span className="pulse-dot"></span>
                        실시간 모니터링 중
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontSize: '0.85rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                        <Calendar size={14} /> {formatKST(currentTime)} (KST)
                    </div>
                </div>
            </div>

            <div className="table-container" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                            <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', width: '160px' }}>종목명</th>
                            {TIME_SLOTS.map(slot => {
                                const active = isCurrentSlot(slot);
                                return (
                                    <th key={slot} style={{ 
                                        textAlign: 'center', 
                                        padding: '1rem', 
                                        fontSize: '0.75rem', 
                                        fontWeight: active ? 800 : 500, 
                                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                        backgroundColor: active ? 'rgba(212, 175, 55, 0.05)' : 'transparent',
                                        transition: 'all 0.3s'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                            <Clock size={12} color={active ? 'var(--accent)' : 'currentColor'} /> {slot}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {top5.map(stock => (
                            <tr key={stock.code} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', height: '70px' }}>
                                <td style={{ padding: '1rem' }}>
                                    <a 
                                        href={`https://kr.tradingview.com/chart/?symbol=KRX:${stock.code}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style={{ textDecoration: 'none', cursor: 'pointer', display: 'block' }}
                                        className="stock-link-hover"
                                    >
                                        <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '2px' }}>{stock.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#666' }}>{stock.code}</div>
                                    </a>
                                </td>
                                {TIME_SLOTS.map(slot => (
                                    <td key={slot} style={{ 
                                        textAlign: 'center', 
                                        padding: '0.5rem',
                                        backgroundColor: isCurrentSlot(slot) ? 'rgba(212, 175, 55, 0.02)' : 'transparent'
                                    }}>
                                        {renderCell(stock.code, slot)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'rgba(212, 175, 55, 0.05)', borderRadius: '12px', border: '1px dashed rgba(212, 175, 55, 0.2)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <p style={{ margin: 0 }}>💡 <strong>절대신호</strong>: AI가 거래대금, 변동성, 추세를 종합 분석하여 포착한 고확률 진입 지점입니다.</p>
                    <p style={{ margin: '4px 0 0' }}>• <span style={{ color: 'var(--accent)' }}>2M</span>: 2분봉 기준 단기 임팩트 신호 | • <span style={{ color: 'var(--primary)' }}>5M</span>: 5분봉 기준 추세 추종 신호</p>
                </div>
            </div>
        </div>
    );
};

export default SignalBoard;
