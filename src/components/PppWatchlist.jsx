import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { 
  Activity, 
  Trash2, 
  ExternalLink, 
  TrendingUp, 
  AlertCircle,
  Play,
  CheckCircle2,
  Clock
} from 'lucide-react';

const TF_COLORS = {
  '3M':  '#FF6B6B', '5M':  '#FF8E53', '30M': '#FFA726',
  '1H':  '#FFCA28', '2H':  '#A5D6A7', '4H':  '#66BB6A',
  '1D':  '#42A5F5', '2D':  '#1E88E5', '1W':  '#1565C0'
};

const fmtPrice = (val) => {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('ko-KR');
};

const parseMatchedTfs = (item) => {
  if (Array.isArray(item.matched_tfs)) return item.matched_tfs;
  try { 
    const parsed = JSON.parse(item.matched_tfs || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const parseTfValues = (item) => {
  if (typeof item.tf_values === 'object' && item.tf_values !== null) return item.tf_values;
  try { 
    const parsed = JSON.parse(item.tf_values || '{}');
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
};

function MatchedTfValues({ item }) {
  const tfs      = parseMatchedTfs(item);
  const tfValues = parseTfValues(item);
  if (tfs.length === 0) return <span style={{ color: '#888', fontSize: '11px' }}>-</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
      {tfs.map(tf => {
        const vals = tfValues[tf] || {};
        return (
          <div key={tf} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              background: TF_COLORS[tf] || '#888',
              color: '#fff', borderRadius: '4px',
              padding: '2px 6px', fontSize: '10px',
              fontWeight: 'bold', minWidth: '34px', textAlign: 'center'
            }}>{tf}</span>
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
              <span style={{ color: 'var(--text-muted)' }}>G-Sell: <strong style={{ color: '#fff' }}>{fmtPrice(vals.gSell)}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>지지: <strong style={{ color: '#fff' }}>{fmtPrice(vals.result2)}</strong></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * PppWatchlist Component (v3.0)
 * [v9.6.1] Streamlined UI with Glassmorphism
 */
const PppWatchlist = ({ user }) => {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const isAdmin = user && user.role === 'ADMIN';

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.get('/api/ppp/watchlist?limit=200');
      if (response.data?.success) {
        setWatchlist(response.data.data);
      }
    } catch (err) {
      console.error('[PppWatchlist] Fetch Error:', err);
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleManualScan = async () => {
    if (!window.confirm('전체 종목(70점↑)에 대해 PPP 스캔을 실행하시겠습니까?\n이 작업은 약 1~2분이 소요될 수 있습니다.')) return;
    
    setScanning(true);
    try {
      const response = await axiosClient.post('/api/ppp/scan');
      if (response.data?.success) {
        alert(`스캔 완료: 신규 ${response.data.data.added}건 추가`);
        fetchData();
      }
    } catch (err) {
      alert('스캔 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (code) => {
    if (!window.confirm(`[${code}] 종목을 워치리스트에서 제거(비활성화) 하시겠습니까?`)) return;
    
    try {
      const response = await axiosClient.delete(`/api/ppp/watchlist/${code}`);
      if (response.data?.success) {
        setWatchlist(prev => prev.filter(item => item.code !== code));
      }
    } catch (err) {
      alert('삭제 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const ppp2List = watchlist.filter(item => item.ppp2);
  const ppp1List = watchlist.filter(item => !item.ppp2 && item.ppp1);

  const StockCard = ({ item }) => (
    <div className="card fade-in" style={{ 
      padding: '1.25rem', 
      background: 'var(--glass)', 
      border: '1px solid var(--glass-border)',
      borderLeft: item.ppp2 ? '4px solid var(--accent)' : '4px solid var(--primary)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      position: 'relative',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'default'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>
            {item.name}
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.code}</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>{fmtPrice(item.current_price)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {item.ppp2 ? (
            <span style={{ 
              background: 'var(--accent)', 
              color: '#fff', 
              fontSize: '0.7rem', 
              fontWeight: 800, 
              padding: '2px 8px', 
              borderRadius: '4px',
              boxShadow: '0 0 10px var(--accent)'
            }}>PPP2 (강력)</span>
          ) : (
            <span style={{ 
              background: 'var(--primary)', 
              color: '#fff', 
              fontSize: '0.7rem', 
              fontWeight: 800, 
              padding: '2px 8px', 
              borderRadius: '4px'
            }}>PPP1 (상승)</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ color: '#FFD700', fontSize: '0.9rem' }}>
          {'★'.repeat(Math.round(item.score / 20))}
          {'☆'.repeat(5 - Math.round(item.score / 20))}
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent)' }}>{item.score}점</span>
      </div>

      <div style={{ 
        background: 'rgba(255,255,255,0.05)', 
        padding: '0.75rem', 
        borderRadius: '8px',
        fontSize: '0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>G-Sell(대표):</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{fmtPrice(item.g_sell)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>지지선(2H):</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{fmtPrice(item.result_2)}</span>
        </div>

        <MatchedTfValues item={item} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>등록일:</span>
          <span>{item.registered_date}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
        <a 
          href={`https://www.tradingview.com/chart/?symbol=KRX:${item.code}`} 
          target="_blank" 
          rel="noreferrer"
          className="action-btn"
          style={{ 
            flex: 1, 
            textAlign: 'center', 
            padding: '0.5rem', 
            fontSize: '0.8rem', 
            background: 'rgba(41, 98, 255, 0.15)', 
            color: '#2962FF',
            borderRadius: '6px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}
        >
          <ExternalLink size={14} /> 차트보기
        </a>
        {isAdmin && (
          <button 
            onClick={() => handleDelete(item.code)}
            style={{ 
              padding: '0.5rem', 
              background: 'rgba(239, 68, 68, 0.15)', 
              color: '#ef4444', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              borderRadius: '6px',
              cursor: 'pointer'
            }}
            title="목록에서 제거"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fade-in" style={{ padding: '1rem' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            background: 'linear-gradient(135deg, var(--accent), var(--secondary))',
            padding: '10px',
            borderRadius: '12px',
            boxShadow: '0 4px 15px rgba(236,72,153,0.3)'
          }}>
            <TrendingUp color="#fff" size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>PPP 고수익 자동 워치리스트</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              MTF BBW & Stochastic 복합 필터 기반 (Alpha v3.0)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={fetchData}
            style={{ 
              padding: '0.6rem 1rem', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 500
            }}
          >
            <Clock size={16} /> 새로고침
          </button>
          
          {isAdmin && (
            <button 
              onClick={handleManualScan}
              disabled={scanning}
              style={{ 
                padding: '0.6rem 1.25rem', 
                background: scanning ? 'rgba(255,255,255,0.1)' : 'var(--primary)', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '8px',
                cursor: scanning ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
                boxShadow: scanning ? 'none' : '0 4px 12px rgba(236, 72, 153, 0.4)'
              }}
            >
              {scanning ? (
                <>
                  <Activity size={18} className="spin" /> 스캔 중...
                </>
              ) : (
                <>
                  <Play size={18} /> 전체 강제 스캔
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div style={{ 
          padding: '3rem', 
          textAlign: 'center', 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '16px',
          color: '#ef4444'
        }}>
          <AlertCircle size={48} style={{ marginBottom: '1rem' }} />
          <p>{error}</p>
          <button onClick={fetchData} style={{ color: '#fff', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>다시 시도</button>
        </div>
      ) : loading ? (
        <div style={{ padding: '5rem', textAlign: 'center' }}>
          <Activity size={48} className="spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>패턴 분석 자료를 구성하고 있습니다...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          {/* PPP2 Section */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '8px', height: '24px', background: 'var(--accent)', borderRadius: '4px' }}></div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>PPP2 — 강력 매수 신호 ({ppp2List.length})</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>강력한 추세 에너지와 타점이 일치하는 종목</span>
            </div>
            {ppp2List.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--glass-border)', color: 'var(--text-muted)' }}>
                현재 포착된 강력 신호가 없습니다.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {ppp2List.map(item => <StockCard key={item.code} item={item} />)}
              </div>
            )}
          </section>

          {/* PPP1 Section */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '8px', height: '24px', background: 'var(--primary)', borderRadius: '4px' }}></div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>PPP1 — 일반 매수 신호 ({ppp1List.length})</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>장기 추세 진입이 확인된 모니터링 대상</span>
            </div>
            {ppp1List.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--glass-border)', color: 'var(--text-muted)' }}>
                포착된 일반 신호가 없습니다.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {ppp1List.map(item => <StockCard key={item.code} item={item} />)}
              </div>
            )}
          </section>

          <footer style={{ 
            marginTop: '2rem', 
            padding: '2rem', 
            background: 'var(--glass)', 
            borderRadius: '16px',
            border: '1px solid var(--glass-border)',
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'flex-start'
          }}>
            <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', color: '#818cf8' }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>PPP 알고리즘 가이드</h4>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.6' }}>
                <li><strong>PPP1</strong>: BBMacd MTF가 상승 추세(bgUp)이며 중기 저점을 돌파한 기초 신호입니다.</li>
                <li><strong>PPP2</strong>: PPP1 조건에 주가 및 RSI 고점 패턴(Result 2)이 상향 돌파된 강력한 매수 타이밍입니다.</li>
                <li>워치리스트 등록 후 <strong>30일간</strong> 자동 모니터링되며, 신호 소멸 시 텔레그램으로 즉시 알림이 발송됩니다.</li>
                <li>모든 가격은 차트 확정봉 기준이며, 진입 타점은 실시간 수급에 따라 조정될 수 있습니다.</li>
              </ul>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};

export default PppWatchlist;
