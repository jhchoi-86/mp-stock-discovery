import React, { useState, useEffect } from 'react';
import { Calendar, Search, Filter, ArrowUpRight, ArrowDownRight, MoreHorizontal, User } from 'lucide-react';
import adminService from '../api/adminService';
import { Virtuoso } from 'react-virtuoso';

const DailySnapshotAnalytics = ({ isPublic = false, isMobile = false }) => {
  const [snapshots, setSnapshots] = useState([]);
  const [dates, setDates] = useState([]);
  const [historyTags, setHistoryTags] = useState([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [selectedTag, setSelectedTag] = useState('none');
  const [searchCode, setSearchCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('yield');
  const [order, setOrder] = useState('desc');

  useEffect(() => {
    fetchDates();
    fetchHistoryTags();
  }, []);

  useEffect(() => {
    fetchSnapshots();
  }, [selectedDate, selectedTag, sortBy, order]);

  const fetchDates = async () => {
    try {
      const data = await adminService.getPublicSnapshotDates();
      setDates(data || []);
      if (data && data.length > 0 && selectedDate === 'all' && selectedTag === 'none') {
        setSelectedDate(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch dates:', err);
    }
  };

  const fetchHistoryTags = async () => {
    try {
      const tags = await adminService.getSyncHistoryTags();
      setHistoryTags(tags || []);
    } catch (err) {
      console.error('Failed to fetch history tags:', err);
    }
  };

  const fetchSnapshots = async () => {
    setIsLoading(true);
    try {
      let data;
      if (selectedTag !== 'none') {
        // Fetch from granular history
        data = await adminService.getSyncHistoryDetails(selectedTag);
      } else {
        // Fetch from daily snapshot
        const params = {
          date: selectedDate,
          code: searchCode,
          sortBy,
          order
        };
        data = await adminService.getPublicSnapshots(params);
      }
      
      // 중복 제거 (code 기준) - O(N) 최적화
      const uniqueMap = new Map();
      (data || []).forEach(item => {
        if (!uniqueMap.has(item.code)) {
          uniqueMap.set(item.code, item);
        }
      });
      const uniqueData = Array.from(uniqueMap.values());
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
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedTag('none');
                }}
                style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', opacity: selectedTag !== 'none' ? 0.3 : 1 }}
              >
                <optgroup label="📅 일별">
                    <option value="all">전체 날짜</option>
                    {dates.map(d => <option key={d} value={d}>{d}</option>)}
                </optgroup>
              </select>
            </div>
          </div>
          
          <div style={{ position: 'relative' }}>
            <Filter size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
            <select 
              value={selectedTag} 
              onChange={(e) => {
                setSelectedTag(e.target.value);
                if (e.target.value !== 'none') setSelectedDate('all');
              }}
              style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', background: 'var(--glass)', border: '1px solid var(--primary)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
            >
              <option value="none">⏱️ 히스토리 선택</option>
              {historyTags.map(t => (
                <option key={t.tagName} value={t.tagName}>{t.tagName}</option>
              ))}
            </select>
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
                    style={{ fontWeight: 800, fontSize: '1rem', cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary)' }}
                    onClick={() => window.open(`https://kr.tradingview.com/chart/?symbol=KRX:${s.code}`, '_blank')}
                  >
                    {s.name} <small style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{s.code}</small>
                  </span>
                  <span style={{ color: s.yield >= 0 ? '#ff4d4d' : '#4d94ff', fontWeight: 'normal' }}>
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
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedTag('none');
              }}
              style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff', opacity: selectedTag !== 'none' ? 0.3 : 1 }}
            >
              <optgroup label="📅 일별 스냅샷">
                <option value="all">전체 날짜</option>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </optgroup>
            </select>
          </div>

          <div style={{ position: 'relative', width: '250px' }}>
            <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
            <select 
              className="card" 
              value={selectedTag} 
              onChange={(e) => {
                setSelectedTag(e.target.value);
                if (e.target.value !== 'none') setSelectedDate('all');
              }}
              style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', background: 'var(--glass)', border: '1px solid var(--primary)', color: '#fff', boxShadow: selectedTag !== 'none' ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none' }}
            >
              <option value="none">⏱️ 저장된 히스토리 선택 (시점별)</option>
              {historyTags.map(t => (
                <option key={t.tagName} value={t.tagName}>{t.tagName}</option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative', width: '200px' }}>
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

        <div style={{ height: '700px' }}>
          <Virtuoso
            style={{ height: '100%' }}
            data={snapshots}
            fixedHeaderContent={() => (
              <thead style={{ background: 'var(--bg)', borderBottom: '2px solid #333' }}>
                <tr>
                  <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer', textAlign: 'left', padding: '1rem', color: 'var(--primary)', width: '180px' }}>종목 (코드) {sortBy === 'name' && (order === 'desc' ? '▼' : '▲')}</th>
                  {!isPublic && <th onClick={() => toggleSort('adx')} style={{ cursor: 'pointer', textAlign: 'center', padding: '1rem', color: 'var(--primary)', width: '100px' }}>세력 (ADX) {sortBy === 'adx' && (order === 'desc' ? '▼' : '▲')}</th>}
                  <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--primary)', width: '150px' }}>상태</th>
                  <th onClick={() => toggleSort('score')} style={{ cursor: 'pointer', textAlign: 'center', padding: '1rem', color: 'var(--primary)', width: '80px' }}>총점 {sortBy === 'score' && (order === 'desc' ? '▼' : '▲')}</th>
                  <th style={{ textAlign: 'right', padding: '1rem', color: 'var(--primary)', width: '120px' }}>진입가</th>
                  <th onClick={() => toggleSort('currentPrice')} style={{ cursor: 'pointer', textAlign: 'right', padding: '1rem', color: 'var(--primary)', width: '120px' }}>현재가</th>
                  <th onClick={() => toggleSort('yield')} style={{ cursor: 'pointer', textAlign: 'right', padding: '1rem', color: 'var(--primary)', width: '120px' }}>수익률 (%) {sortBy === 'yield' && (order === 'desc' ? '▼' : '▲')}</th>
                  {!isPublic && <th onClick={() => toggleSort('tradeAmount')} style={{ cursor: 'pointer', textAlign: 'right', padding: '1rem', color: 'var(--primary)', width: '120px' }}>거래대금 {sortBy === 'tradeAmount' && (order === 'desc' ? '▼' : '▲')}</th>}
                  {!isPublic && <th style={{ textAlign: 'center', padding: '1rem', color: 'var(--primary)', width: '100px' }}>수급 (외/기)</th>}
                </tr>
              </thead>
            )}
            itemContent={(idx, s) => (
              <tr style={{ borderBottom: '1px solid #222', display: 'table', tableLayout: 'fixed', width: '100%' }}>
                <td style={{ padding: '1rem', width: '180px' }}>
                  <div 
                    style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => window.open(`https://kr.tradingview.com/chart/?symbol=KRX:${s.code}`, '_blank')}
                  >
                    {s.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>({s.code})</div>
                </td>
                {!isPublic && (
                  <td style={{ padding: '1rem', textAlign: 'center', width: '100px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'normal', color: s.adx >= 25 ? 'var(--accent)' : '#fff' }}>
                      {Math.round(s.adx || 0)}
                    </div>
                  </td>
                )}
                <td style={{ padding: '1rem', width: '150px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#fff' }}>{s.category}</span>
                </td>
                <td style={{ padding: '1rem', textAlign: 'center', width: '80px' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 'normal', color: '#fff' }}>
                    {s.score}
                  </div>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', width: '120px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#bbb' }}>
                    {Math.round(s.entryPrice1 || 0).toLocaleString()}
                  </div>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', width: '120px' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 'normal', color: '#fff' }}>
                      {Math.round(s.currentPrice || 0).toLocaleString()}원
                  </div>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', width: '120px' }}>
                  <div style={{
                      fontSize: '1.1rem', 
                      fontWeight: 'normal', 
                      color: (s.yield || 0) >= 0 ? '#ff4d4d' : '#4d94ff'
                  }}>
                      {(s.yield || 0) >= 0 ? '+' : ''}{(s.yield || 0).toFixed(2)}%
                  </div>
                </td>
                {!isPublic && (
                  <td style={{ padding: '1rem', textAlign: 'right', width: '120px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#fff' }}>
                      {s.tradeAmount ? Math.round(Number(s.tradeAmount) / 100000000).toLocaleString() + '억' : '0'}
                    </div>
                  </td>
                )}
                {!isPublic && (
                  <td style={{ padding: '1rem', textAlign: 'center', width: '100px' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                       {(() => {
                         const parseStatus = (val) => {
                           if (!val || val === '0') return '#666';
                           if (val === 'UP' || (typeof val === 'string' && val.includes('+'))) return '#ff4d4d';
                           if (val === 'DOWN' || (typeof val === 'string' && val.includes('-'))) return '#4d94ff';
                           const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
                           if (isNaN(n) || n === 0) return '#666';
                           return n > 0 ? '#ff4d4d' : '#4d94ff';
                         };
                         return (
                           <>
                             <span style={{ fontSize: '0.7rem', color: parseStatus(s.foreignBuy), fontWeight: 800 }}>외</span>
                             <span style={{ fontSize: '0.7rem', color: parseStatus(s.instBuy), fontWeight: 800 }}>기</span>
                           </>
                         );
                       })()}
                    </div>
                  </td>
                )}
              </tr>
            )}
            components={{
              Table: ({ children, style, ...props }) => (
                <table {...props} style={{ ...style, width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  {children}
                </table>
              ),
              TableBody: React.forwardRef(({ children, ...props }, ref) => (
                <tbody {...props} ref={ref}>
                  {children}
                </tbody>
              ))
            }}
          />
        </div>
    </div>
  );
};

export default DailySnapshotAnalytics;
