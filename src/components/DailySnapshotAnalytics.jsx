import React, { useState, useEffect } from 'react';
import { Calendar, Search, Filter, ArrowUpRight, ArrowDownRight, MoreHorizontal, User } from 'lucide-react';
import adminService from '../api/adminService';

const DailySnapshotAnalytics = ({ isPublic = false, isMobile = false }) => {
  const [snapshots, setSnapshots] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [searchCode, setSearchCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('yield');
  const [order, setOrder] = useState('desc');

  useEffect(() => {
    fetchDates();
    fetchSnapshots();
  }, [selectedDate, sortBy, order]);

  const fetchDates = async () => {
    try {
      const data = isPublic 
        ? await adminService.getPublicSnapshotDates()
        : await adminService.getPublicSnapshotDates(); // Admin uses same date list currently
      setDates(data || []);
      if (data && data.length > 0 && selectedDate === 'all') {
        setSelectedDate(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch dates:', err);
    }
  };

  const fetchSnapshots = async () => {
    setIsLoading(true);
    try {
      const params = {
        date: selectedDate,
        code: searchCode,
        sortBy,
        order
      };
      
      const data = await adminService.getPublicSnapshots(params);
      
      // 중복 제거 (code 기준) - 전체 348종목 유지
      const uniqueData = (data || []).reduce((acc, current) => {
        const x = acc.find(item => item.code === current.code);
        if (!x) return acc.concat([current]);
        return acc;
      }, []);

      setSnapshots(uniqueData);
    } catch (err) {
      console.error('Failed to fetch snapshots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter') fetchSnapshots();
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setOrder(order === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setOrder('desc');
    }
  };

  if (isMobile) {
    return (
      <div className="daily-analytics-mobile">
        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Calendar size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <select 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
              >
                <option value="all">전체 날짜</option>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="종목명 검색..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              onKeyDown={handleSearch}
              style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>데이터 로딩중...</div>
        ) : snapshots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>데이터가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {snapshots.map((s, idx) => (
              <div key={idx} className="card" style={{ padding: '1rem', borderLeft: `4px solid ${s.yield >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span 
                    style={{ fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary)' }}
                    onClick={() => window.open(`https://kr.tradingview.com/chart/?symbol=KRX:${s.code}`, '_blank')}
                  >
                    {s.name} <small style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{s.code}</small>
                  </span>
                  <span style={{ color: s.yield >= 0 ? '#ff4d4d' : '#4d94ff', fontWeight: 'bold' }}>
                    {s.yield >= 0 ? '+' : ''}{(s.yield || 0).toFixed(2)}%
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>진입가:</span> {Math.round(s.entryPrice1 || 0).toLocaleString()}원</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>현재가:</span> {Math.round(s.currentPrice).toLocaleString()}원</div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-muted)' }}>상태:</span> {s.category}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="daily-snapshot-analytics card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '200px' }}>
            <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <select 
              className="card" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}
            >
              <option value="all">전체 날짜</option>
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ position: 'relative', width: '250px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="종목명/코드 검색..."
              className="card"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              onKeyDown={handleSearch}
              style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}
            />
          </div>
        </div>
        
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          데이터 수: <strong>{snapshots.length}</strong>
        </div>
      </div>

      <div className="table-container" style={{ maxHeight: '700px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', borderBottom: '2px solid #333' }}>
            <tr>
              <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer', textAlign: 'left', padding: '1rem', color: 'var(--primary)', width: '180px' }}>종목 (코드) {sortBy === 'name' && (order === 'desc' ? '▼' : '▲')}</th>
              {!isPublic && <th onClick={() => toggleSort('adx')} style={{ cursor: 'pointer', textAlign: 'center', padding: '1rem', color: 'var(--primary)' }}>세력 (ADX) {sortBy === 'adx' && (order === 'desc' ? '▼' : '▲')}</th>}
              <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--primary)' }}>상태</th>
              <th onClick={() => toggleSort('score')} style={{ cursor: 'pointer', textAlign: 'center', padding: '1rem', color: 'var(--primary)' }}>총점 {sortBy === 'score' && (order === 'desc' ? '▼' : '▲')}</th>
              <th style={{ textAlign: 'right', padding: '1rem', color: 'var(--primary)' }}>진입가</th>
              <th onClick={() => toggleSort('currentPrice')} style={{ cursor: 'pointer', textAlign: 'right', padding: '1rem', color: 'var(--primary)' }}>현재가</th>
              <th onClick={() => toggleSort('yield')} style={{ cursor: 'pointer', textAlign: 'right', padding: '1rem', color: 'var(--primary)' }}>수익률 (%) {sortBy === 'yield' && (order === 'desc' ? '▼' : '▲')}</th>
              {!isPublic && <th onClick={() => toggleSort('tradeAmount')} style={{ cursor: 'pointer', textAlign: 'right', padding: '1rem', color: 'var(--primary)' }}>거래대금 {sortBy === 'tradeAmount' && (order === 'desc' ? '▼' : '▲')}</th>}
              {!isPublic && <th style={{ textAlign: 'center', padding: '1rem', color: 'var(--primary)' }}>수급 (외/기)</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={isPublic ? 5 : 9} style={{ textAlign: 'center', padding: '3rem' }}>로딩 중...</td></tr>
            ) : snapshots.length === 0 ? (
              <tr><td colSpan={isPublic ? 5 : 9} style={{ textAlign: 'center', padding: '3rem' }}>데이터가 없습니다.</td></tr>
            ) : (
              snapshots.map((s, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '1rem' }}>
                    <div 
                      style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => window.open(`https://kr.tradingview.com/chart/?symbol=KRX:${s.code}`, '_blank')}
                    >
                      {s.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>({s.code})</div>
                  </td>
                  {!isPublic && (
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: s.adx >= 25 ? 'var(--accent)' : '#fff' }}>
                        {s.adx || 0}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#666' }}>{s.adx >= 25 ? '강함' : '추세중'}</div>
                    </td>
                  )}
                  <td style={{ padding: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#fff' }}>{s.category}</span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
                      {s.score}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: '#bbb' }}>
                      {Math.round(s.entryPrice1 || 0).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
                        {Math.round(s.currentPrice || 0).toLocaleString()}원
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{
                        fontSize: '1.1rem', 
                        fontWeight: 900, 
                        color: s.yield >= 0 ? '#ff4d4d' : '#4d94ff'
                    }}>
                        {s.yield >= 0 ? '+' : ''}{(s.yield || 0).toFixed(2)}%
                    </div>
                  </td>
                  {!isPublic && (
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', color: '#fff' }}>
                        {s.tradeAmount ? Math.round(Number(s.tradeAmount) / 100000000).toLocaleString() + '억' : '0'}
                      </div>
                    </td>
                  )}
                  {!isPublic && (
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                         <span style={{ fontSize: '0.7rem', color: s.foreignBuy === 'UP' ? '#ff4d4d' : (s.foreignBuy === 'DOWN' ? '#4d94ff' : '#666') }}>외</span>
                         <span style={{ fontSize: '0.7rem', color: s.instBuy === 'UP' ? '#ff4d4d' : (s.instBuy === 'DOWN' ? '#4d94ff' : '#666') }}>기</span>
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#444' }}>D-1 기준</div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DailySnapshotAnalytics;
