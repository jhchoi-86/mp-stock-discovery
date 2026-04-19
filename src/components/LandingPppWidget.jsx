import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { 
  TrendingUp, 
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Clock,
  RotateCcw,
  X
} from 'lucide-react';

/**
 * LandingPppWidget (v3.5)
 * Optimized for Landing Page Integration (v9.7.7)
 * Design: High-Premium Dark Minimalist Table
 */
const LandingPppWidget = ({ user }) => {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanStatus, setScanStatus] = useState({ status: 'idle', processed: 0, total: 0, percentage: 0 });
  const isAdmin = user?.role === 'ADMIN';

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.get('/api/ppp/watchlist?limit=50');
      if (response.data?.success) {
        setWatchlist(response.data.data);
      }
    } catch (err) {
      console.error('[LandingPppWidget] Fetch Error:', err);
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const checkInitialScanStatus = async () => {
    try {
      const res = await axiosClient.get('/api/ppp/scan-status');
      if (res.data?.success && res.data.data.status === 'scanning') {
        setScanStatus(res.data.data);
      }
    } catch (e) {
      console.error('[LandingPppWidget] Initial status check failed:', e);
    }
  };

  useEffect(() => {
    fetchData();
    checkInitialScanStatus();
  }, []);

  // [v9.7.1] Scan Status Polling
  useEffect(() => {
    let timer;
    const poll = async () => {
      try {
        const res = await axiosClient.get('/api/ppp/scan-status');
        if (res.data?.success) {
          const newData = res.data.data;
          setScanStatus(newData);
          if (newData.status === 'idle') {
            clearInterval(timer);
            fetchData();
          }
        }
      } catch (e) {
        console.error('[ScanStatus] Polling error:', e);
      }
    };

    if (scanStatus.status === 'scanning') {
      poll();
      timer = setInterval(poll, 1500);
    }
    return () => clearInterval(timer);
  }, [scanStatus.status]);

  const handleManualScan = async () => {
    try {
      setScanStatus({ status: 'scanning', processed: 0, total: 350, percentage: 0 });
      const response = await axiosClient.post('/api/ppp/scan');
      if (response.data?.success) {
        setScanStatus({ status: 'idle', processed: 0, total: 0, percentage: 0 });
        fetchData();
      }
    } catch (err) {
      console.error('[ManualScan] Error:', err);
      alert('스캔 실패: ' + (err.response?.data?.error || err.message));
      setScanStatus({ status: 'idle', processed: 0, total: 0, percentage: 0 });
    }
  };

  const handleDelete = async (code) => {
    if (!window.confirm(`[${code}] 종목을 워치리스트에서 제거 하시겠습니까?`)) return;
    try {
      const response = await axiosClient.delete(`/api/ppp/watchlist/${code}`);
      if (response.data?.success) {
        setWatchlist(prev => prev.filter(item => item.code !== code));
      }
    } catch (err) {
      alert('삭제 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleScanReset = async () => {
    if (!window.confirm('현재 실행 중인 모든 스캔 상태를 강제로 초기화하시겠습니까?')) return;
    try {
      const response = await axiosClient.post('/api/ppp/scan-reset');
      if (response.data?.success) {
        setScanStatus({ status: 'idle', processed: 0, total: 0, percentage: 0 });
        alert(response.data.message);
      }
    } catch (err) {
      alert('초기화 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const ppp2List = watchlist.filter(item => item.ppp2);
  const ppp1List = watchlist.filter(item => !item.ppp2 && item.ppp1);

  const SectionHeader = ({ title, count, color, subtitle }) => (
    <div style={{ marginBottom: '1.25rem', marginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
        <div style={{ width: '4px', height: '22px', background: color, borderRadius: '2px' }}></div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0 }}>
          {title} ({count})
        </h3>
        {subtitle && <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>{subtitle}</span>}
      </div>
    </div>
  );

  const fmtPrice = (val) => {
    if (val === null || val === undefined) return '-';
    return Number(val).toLocaleString('ko-KR');
  };
  
  const getScoreColor = (score) => {
    if (score >= 90) return '#EF4444';
    if (score >= 80) return '#F97316';
    return '#EAB308';
  };

  const getDDay = (expiry) => {
    const diff = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return { text: '만료', color: 'rgba(255,255,255,0.3)' };
    return { text: `D-${diff}`, color: diff <= 7 ? '#EF4444' : '#fff' };
  };

  const getSignalDot = (type) => {
    const colors = { PPP2: '#10B981', PPP1: '#F59E0B', NONE: '#EF4444' };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors[type] || colors.NONE }}></div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{type || 'NONE'}</span>
      </div>
    );
  };

  const TF_COLORS = {
    '3M':  '#FF6B6B', '5M':  '#FF8E53', '30M': '#FFA726',
    '1H':  '#FFCA28', '2H':  '#A5D6A7', '4H':  '#66BB6A',
    '1D':  '#42A5F5', '2D':  '#1E88E5', '1W':  '#1565C0'
  };

  const parseMatchedTfs = (item) => {
    if (Array.isArray(item.matched_tfs)) return item.matched_tfs;
    try { return JSON.parse(item.matched_tfs || '[]'); } catch { return []; }
  };
  
  const parseTfValues = (item) => {
    if (typeof item.tf_values === 'object' && item.tf_values !== null) return item.tf_values;
    try { return JSON.parse(item.tf_values || '{}'); } catch { return {}; }
  };

  const TfBadgeList = ({ item }) => {
    const tfs = parseMatchedTfs(item);
    const tfValues = parseTfValues(item);
    if (tfs.length === 0) return <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px' }}>-</span>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {tfs.map(tf => {
          const vals = tfValues[tf] || {};
          return (
            <div key={tf} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                background: TF_COLORS[tf] || '#888',
                color: '#fff', borderRadius: '3px',
                padding: '1px 4px', fontSize: '9px',
                fontWeight: 'bold', minWidth: '30px', textAlign: 'center'
              }}>{tf}</span>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                G:{fmtPrice(vals.gSell)} / J:{fmtPrice(vals.result2)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const PppTable = ({ items, emptyText }) => (
    <div style={{ 
      background: 'rgba(255,255,255,0.02)', 
      border: '1px solid rgba(255,255,255,0.05)', 
      borderRadius: '16px',
      overflowX: 'auto',
      marginBottom: '2rem'
    }}>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)' }}>{emptyText}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
              {['순위', '종목코드', '종목명', '점수', '현재가', 'PPP1', 'PPP2', '타임프레임(G/J)', 'G-Sell(대표)', '지지선(대표)', '등록일', '만료일', '잔여일', '신호', '관리'].map((h, i) => (
                <th key={i} style={{ padding: '1rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const dDay = getDDay(item.expires_at);
              return (
                <tr key={item.code} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)' }}>{idx + 1}</td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', fontWeight: 500 }}>{item.code}</td>
                  <td style={{ padding: '1rem' }}>
                    <a 
                      href={`https://www.tradingview.com/chart/?symbol=KRX:${item.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#fff', fontWeight: 700, textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      {item.name}
                    </a>
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 800, color: getScoreColor(item.score) }}>{item.score}</td>
                  <td style={{ padding: '1rem', fontWeight: 700, color: '#fff' }}>{fmtPrice(item.current_price)}</td>
                   <td style={{ padding: '1rem' }}>{item.ppp1 ? '✅' : '❌'}</td>
                  <td style={{ padding: '1rem' }}>{item.ppp2 ? '✅' : '❌'}</td>
                  <td style={{ padding: '1rem' }}>
                    <TfBadgeList item={item} />
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{fmtPrice(item.g_sell)}</td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{fmtPrice(item.result_2)}</td>
                  <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{item.registered_date}</td>
                  <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)' }}>
                    {new Date(item.expires_at).toISOString().split('T')[0]}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 700, color: dDay.color }}>{dDay.text}</td>
                  <td style={{ padding: '1rem' }}>{getSignalDot(item.last_signal)}</td>
                  <td style={{ padding: '1rem' }}>
                    {isAdmin && (
                      <button 
                        onClick={() => handleDelete(item.code)}
                        style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', opacity: 0.6 }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '4rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
                width: '48px', height: '48px', 
                background: 'linear-gradient(135deg, #ff4d4d, #f97316)', 
                borderRadius: '12px', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(249, 115, 22, 0.3)'
            }}>
                <TrendingUp size={24} color="#fff" />
            </div>
            <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                    PPP 고수의 자동 워치리스트
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '4px 0 0 0' }}>
                    MTF BBW & Stochastic 복합 필터 기반 (Alpha v3.5)
                </p>
            </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
            {isAdmin && (
                <button 
                onClick={handleManualScan}
                disabled={scanStatus.status === 'scanning'}
                style={{ 
                    background: scanStatus.status === 'scanning' ? 'rgba(231, 76, 60, 0.1)' : 'rgba(212, 175, 55, 0.15)', 
                    border: scanStatus.status === 'scanning' ? '1px solid rgba(231, 76, 60, 0.3)' : '1px solid rgba(212, 175, 55, 0.3)', 
                    color: '#fff', 
                    padding: '0.5rem 1.25rem', 
                    borderRadius: '8px', 
                    cursor: scanStatus.status === 'scanning' ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem'
                }}
                >
                <TrendingUp size={14} className={scanStatus.status === 'scanning' ? 'spin' : ''} />
                {scanStatus.status === 'scanning' 
                    ? `스캔 분석중 (${scanStatus.processed}/${scanStatus.total || 350}, ${scanStatus.percentage}%)` 
                    : '전체 강제 스캔'}
                </button>
            )}

            {isAdmin && (
                <button 
                onClick={handleScanReset}
                style={{ 
                    background: 'rgba(52, 152, 219, 0.1)', 
                    border: '1px solid rgba(52, 152, 219, 0.3)', 
                    color: '#fff', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '8px', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem'
                }}
                title="스캔 상태 강제 초기화"
                >
                <RotateCcw size={14} />
                스캔 초기화
                </button>
            )}

            <button 
            onClick={fetchData}
            disabled={loading}
            style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                color: '#fff', 
                padding: '0.5rem 1.25rem', 
                borderRadius: '8px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem'
            }}
            >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? '갱신중' : '새로고침'}
            </button>
        </div>
      </div>

      {error ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#ff4d4d' }}>{error}</div>
      ) : (
        <>
            <SectionHeader 
                title="PPP2 — 강력 매수 신호" 
                count={ppp2List.length} 
                color="#10B981" 
                subtitle="강력한 추세 에너지와 타점이 일치하는 종목"
            />
            <PppTable items={ppp2List} emptyText="현재 포착된 강력 신호가 없습니다." />

            <SectionHeader 
                title="PPP1 — 일반 매수 신호" 
                count={ppp1List.length} 
                color="#F59E0B" 
                subtitle="장기 추세 진입이 확인된 모니터링 대상"
            />
            <PppTable items={ppp1List} emptyText="포착된 일반 신호가 없습니다." />
        </>
      )}

      <div style={{ 
        background: 'rgba(255,255,255,0.03)', 
        border: '1px solid rgba(255,255,255,0.08)', 
        borderRadius: '20px', 
        padding: '2rem',
        display: 'flex',
        gap: '1.5rem',
        alignItems: 'flex-start',
        marginTop: '2rem'
      }}>
        <div style={{ 
            width: '40px', height: '40px', 
            background: 'rgba(99, 102, 241, 0.1)', 
            borderRadius: '10px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
        }}>
            <HelpCircle size={20} color="#818cf8" />
        </div>
        <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', margin: '0 0 1rem 0' }}>
                PPP 알고리즘 가이드
            </h4>
            <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                    { label: "PPP1", desc: "BBMacd MTF가 상승 추세(bgUp)이며 중기 저점을 돌파한 기초 신호입니다." },
                    { label: "PPP2", desc: "PPP1 조건에 주가 및 RSI 고점 패턴(Result 2)이 상향 돌파된 강력한 매수 타이밍입니다." },
                    { label: "Monitoring", desc: "워치리스트 등록 후 30일간 자동 모니터링되며, 신호 소멸 시 텔레그램으로 즉시 알림이 발송됩니다." },
                    { label: "Notice", desc: "모든 가격은 차트 확정봉 기준이며, 진입 타점은 실시간 수급에 따라 조정될 수 있습니다." }
                ].map((item, idx) => (
                    <li key={idx} style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: '#fff', fontWeight: 700, minWidth: '80px' }}>• {item.label}:</span>
                        <span style={{ lineHeight: 1.5 }}>{item.desc}</span>
                    </li>
                ))}
            </ul>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '4rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
          <p style={{ color: '#ffb86c', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ 본 서비스는 자동 매매가 아닙니다. 모든 투자 판단 및 손실에 대한 책임은 투자자 본인에게 있습니다.</p>
          <p>© 2026 MP Stock. All rights reserved.</p>
          <p style={{ opacity: 0.7 }}>본 프로그램의 소유권은 MP Stock에 있으며 무단 복제 및 수정을 금합니다.</p>
      </div>
    </div>
  );
};

export default LandingPppWidget;
