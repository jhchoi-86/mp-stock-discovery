import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { Clock, Zap, CheckCircle2, Calendar, Search, History } from 'lucide-react';

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', 
  '15:00', '15:30'
];

const AdminSignalHistory = () => {
    const [availableDates, setAvailableDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [historyData, setHistoryData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // 1. 가용 날짜 목록 로드
    useEffect(() => {
        const fetchDates = async () => {
            try {
                const res = await axiosClient.get('/api/admin/daily-signal-dates');
                setAvailableDates(res.data);
                if (res.data.length > 0) {
                    setSelectedDate(res.data[0]);
                }
            } catch (err) {
                console.error('Failed to fetch history dates');
            }
        };
        fetchDates();
    }, []);

    // 2. 선택된 날짜의 데이터 로드
    const fetchHistory = async (date) => {
        if (!date) return;
        setIsLoading(true);
        try {
            const res = await axiosClient.get(`/api/admin/daily-signals/${date}`);
            setHistoryData(res.data);
        } catch (err) {
            alert('데이터를 불러오지 못했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualBackup = async () => {
        if (!confirm('현재 실시간 전광판 데이터를 즉시 DB에 백업하시겠습니까? (당일 데이터 덮어쓰기)')) return;
        try {
            const res = await axiosClient.post('/api/admin/daily-signals/backup');
            alert(res.data.message);
            // 가용 날짜 목록 갱신
            const dateRes = await axiosClient.get('/api/admin/daily-signal-dates');
            setAvailableDates(dateRes.data);
        } catch (err) {
            alert('백업 실패: ' + (err.response?.data?.error || err.message));
        }
    };

    useEffect(() => {
        if (selectedDate) fetchHistory(selectedDate);
    }, [selectedDate]);

    const renderCell = (stockCode, slot) => {
        const slotInfo = historyData?.[stockCode]?.[slot];
        const has2m = slotInfo?.tf2m;
        const has5m = slotInfo?.tf5m;

        return (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <div style={{ 
                    width: '32px', 
                    height: '24px', 
                    borderRadius: '4px', 
                    border: '1px solid var(--glass-border)',
                    backgroundColor: has2m ? 'rgba(255, 159, 67, 0.2)' : 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {has2m ? <Zap size={14} color="#ff9f43" fill="#ff9f43" /> : <span style={{fontSize: '0.6rem', color: '#333'}}>2M</span>}
                </div>
                <div style={{ 
                    width: '32px', 
                    height: '24px', 
                    borderRadius: '4px', 
                    border: '1px solid var(--glass-border)',
                    backgroundColor: has5m ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {has5m ? <CheckCircle2 size={14} color="var(--primary)" fill="var(--primary)" /> : <span style={{fontSize: '0.6rem', color: '#333'}}>5M</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="fade-in">
            {/* Control Header */}
            <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(212, 175, 55, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <History color="var(--primary)" size={24} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>실시간 매매 신호 이력 조회</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>과거 특정 일자의 30분 단위 신호 포착 현황을 복기합니다.</p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        onClick={handleManualBackup}
                        className="card"
                        style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}
                        title="오늘 현재까지의 신호 데이터를 즉시 DB로 보관합니다."
                    >
                        <Zap size={16} /> 즉시 백업
                    </button>
                    <div style={{ position: 'relative' }}>
                        <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
                        <select 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            style={{
                                padding: '0.6rem 1rem 0.6rem 2.5rem',
                                background: 'rgba(0,0,0,0.4)',
                                border: '1px solid var(--glass-border)',
                                color: '#fff',
                                borderRadius: '8px',
                                outline: 'none',
                                cursor: 'pointer',
                                minWidth: '160px'
                            }}
                        >
                            {availableDates.length === 0 && <option>데이터 없음</option>}
                            {availableDates.map(date => (
                                <option key={date} value={date}>{date}</option>
                            ))}
                        </select>
                    </div>
                    <button 
                        onClick={() => fetchHistory(selectedDate)}
                        className="card"
                        style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--glass-border)' }}
                    >
                        <Search size={16} /> 조회
                    </button>
                </div>
            </div>

            {/* Signal Table */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-secondary)' }}>데이터를 읽어오는 중...</div>
            ) : historyData && Object.keys(historyData).length > 0 ? (
                <div className="card" style={{ padding: '1.5rem', overflowX: 'auto', background: 'rgba(0,0,0,0.3)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                                <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', width: '200px' }}>종목명</th>
                                {TIME_SLOTS.map(slot => (
                                    <th key={slot} style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                            <Clock size={12} /> {slot}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(historyData).map(([code, data]) => (
                                <tr key={code} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', height: '70px' }}>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '2px' }}>{data._name || '종목명'}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#666' }}>{code}</div>
                                    </td>
                                    {TIME_SLOTS.map(slot => (
                                        <td key={slot} style={{ textAlign: 'center', padding: '0.5rem' }}>
                                            {renderCell(code, slot)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="card" style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--glass-border)' }}>
                    {selectedDate ? '선택한 날짜에 저장된 신호 이력이 없습니다.' : '조회할 날짜를 선택해 주세요.'}
                </div>
            )}
        </div>
    );
};

export default AdminSignalHistory;
