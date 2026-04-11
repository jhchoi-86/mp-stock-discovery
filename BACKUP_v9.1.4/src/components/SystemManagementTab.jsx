import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { Activity, Users, ShieldAlert, Cpu, HardDrive, Thermometer, CheckCircle, AlertCircle } from 'lucide-react';

const SystemManagementTab = () => {
    const [stats, setStats] = useState([]);
    const [resources, setResources] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [statsRes, resRes, incRes] = await Promise.all([
                axiosClient.get('/api/admin/system/stats'),
                axiosClient.get('/api/admin/system/resources'),
                axiosClient.get('/api/admin/system/incidents')
            ]);
            setStats(statsRes.data);
            setResources(resRes.data);
            setIncidents(incRes.data);
        } catch (err) {
            console.error('Failed to fetch system data', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const iv = setInterval(fetchData, 30000); // 30초마다 갱신
        return () => clearInterval(iv);
    }, []);

    const renderResourceGauge = (label, value, icon, color) => {
        const percentage = Math.min(Math.max(value, 0), 100);
        return (
            <div className="card" style={{ padding: '1rem', flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                        {icon} {label}
                    </div>
                    <div style={{ fontWeight: 'bold', color: percentage > 85 ? '#f87171' : color }}>{percentage}%</div>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ 
                        width: `${percentage}%`, 
                        height: '100%', 
                        background: percentage > 85 ? '#ef4444' : color,
                        transition: 'width 0.5s ease'
                    }} />
                </div>
            </div>
        );
    };

    if (isLoading && !resources) return <div style={{ color: '#fff', padding: '2rem' }}>데이터 로드 중...</div>;

    const todayStats = stats[0] || {};

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* 1. 상단 요약 카드 */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: 1, minWidth: '200px', background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(0,0,0,0.4))' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>오늘의 방문자</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>{todayStats.visitorCount || 0} 명</div>
                    <div style={{ fontSize: '0.8rem', color: '#34d399', marginTop: '0.2rem' }}>↑ 실시간 집계 중</div>
                </div>
                <div className="card" style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>최대 동시 접속</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>{todayStats.maxConcurrent || 0} 명</div>
                </div>
                <div className="card" style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>신규 가입</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>{todayStats.signupCount || 0} 명</div>
                </div>
                <div className="card" style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>유/무료 비율</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>
                        PRO {todayStats.paidUserCount || 0} / FREE {todayStats.freeUserCount || 0}
                    </div>
                </div>
            </div>

            {/* 2. 시스템 리소스 현황 */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {renderResourceGauge('CPU 사용률', resources?.cpuUsage || 0, <Cpu size={18} />, '#3b82f6')}
                {renderResourceGauge('RAM 사용률', resources?.memUsage || 0, <Activity size={18} />, '#8b5cf6')}
                {renderResourceGauge('Disk 점유율', resources?.diskUsage || 0, <HardDrive size={18} />, '#f59e0b')}
                <div className="card" style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                        width: '48px', height: '48px', borderRadius: '50%', 
                        background: (resources?.health === 'HEALTHY') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {resources?.health === 'HEALTHY' ? <CheckCircle color="#10b981" size={28} /> : <AlertCircle color="#ef4444" size={28} />}
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>시스템 상태</div>
                        <div style={{ fontWeight: 'bold', color: resources?.health === 'HEALTHY' ? '#10b981' : '#ef4444' }}>
                            {resources?.health === 'HEALTHY' ? '정상 작동 중' : '주의 필요'}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. 장애 이력 및 처리 현황 */}
            <div className="card" style={{ padding: '0' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
                        <ShieldAlert size={20} color="#f87171" /> 시스템 장애 및 이벤트 로그
                    </h3>
                    <button className="btn-small" style={{ fontSize: '0.8rem' }} onClick={() => alert('수동 로그 기능 준비 중')}>새 로그 등록</button>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {incidents.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>기록된 시스템 이벤트가 없습니다.</div>
                    ) : (
                        incidents.map(inc => (
                            <div key={inc.id} style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <div style={{ 
                                        marginTop: '4px', width: '8px', height: '8px', borderRadius: '50%', 
                                        background: inc.severity === 'ERROR' || inc.severity === 'FATAL' ? '#ef4444' : '#f59e0b' 
                                    }} />
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: '500' }}>{inc.title}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{inc.description}</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(inc.occurredAt).toLocaleString()}</div>
                                    <div style={{ 
                                        marginTop: '4px', fontSize: '0.7rem', display: 'inline-block', padding: '0.1rem 0.4rem', 
                                        borderRadius: '4px', background: inc.status === 'RESOLVED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: inc.status === 'RESOLVED' ? '#34d399' : '#f87171'
                                    }}>
                                        {inc.status}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 4. 일일 통계 요약 테이블 */}
            <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--glass-border)', color: '#fff', fontWeight: 'bold' }}>
                    최근 30일 주요 지표 히스토리
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)' }}>
                        <tr>
                            <th style={{ padding: '1rem' }}>날짜</th>
                            <th style={{ padding: '1rem' }}>방문자</th>
                            <th style={{ padding: '1rem' }}>로그인</th>
                            <th style={{ padding: '1rem' }}>최대동접</th>
                            <th style={{ padding: '1rem' }}>CPU(avg)</th>
                            <th style={{ padding: '1rem' }}>MEM(avg)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.slice(0, 10).map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <td style={{ padding: '0.8rem 1rem', color: '#fff' }}>{s.date}</td>
                                <td style={{ padding: '0.8rem 1rem' }}>{s.visitorCount}</td>
                                <td style={{ padding: '0.8rem 1rem' }}>{s.loginCount}</td>
                                <td style={{ padding: '0.8rem 1rem' }}>{s.maxConcurrent}</td>
                                <td style={{ padding: '0.8rem 1rem' }}>{s.cpuUsageAvg?.toFixed(1)}%</td>
                                <td style={{ padding: '0.8rem 1rem' }}>{s.memUsageAvg?.toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SystemManagementTab;
