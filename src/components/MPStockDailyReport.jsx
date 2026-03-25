import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const MPStockDailyReport = ({ data, isLoading, isFallback }) => {
  if (isLoading) {
    return (
      <div style={{width: '100%', height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem'}}>
        <Loader2 className="animate-spin" size={40} style={{color: 'var(--primary)'}} />
        <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>데이터 실시간 분석 중...</p>
      </div>
    );
  }

  if (!data || !data.stocks || data.stocks.length === 0) {
    return (
      <div style={{
          width: '100%', 
          padding: '4rem 2rem', 
          border: '1px dashed var(--glass-border)', 
          borderRadius: '24px', 
          textAlign: 'center',
          color: 'var(--text-secondary)'
      }}>
        <p style={{fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem'}}>오늘의 매수 체결 데이터가 아직 수집되지 않았습니다.</p>
        <p style={{fontSize: '0.8rem'}}>장중 실시간 업데이트 예정입니다. (Market Open: 09:00)</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="lp-report-card"
    >
      {/* Header */}
      <div className="lp-report-header">
        <div className="lp-report-title">
          <div className="lp-report-indicator"></div>
          Daily Performance Highlights
        </div>
        <div style={{display: 'flex', gap: '2rem'}}>
            <div style={{textAlign: 'right'}}>
                <p style={{fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.1em', fontWeight: 800}}>EXECUTION</p>
                <p style={{fontSize: '1.25rem', fontWeight: 900, color: '#fff'}}>{data.summary?.execution_rate || 0}%</p>
            </div>
            <div style={{textAlign: 'right', borderLeft: '1px solid var(--glass-border)', paddingLeft: '2rem'}}>
                <p style={{fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.1em', fontWeight: 800}}>AVG YIELD</p>
                <p style={{fontSize: '1.25rem', fontWeight: 900, color: (data.summary?.avg_yield || 0) >= 0 ? '#ff4d4d' : '#4da6ff'}}>
                    {(data.summary?.avg_yield || 0) >= 0 ? '+' : ''}{data.summary?.avg_yield || 0}%
                </p>
            </div>
        </div>
      </div>

      {/* Table */}
      <div className="lp-report-table-wrapper">
        <table className="lp-report-table">
          <thead>
            <tr>
              <th>종목명 / 코드</th>
              <th>진입 타점</th>
              <th style={{textAlign: 'center'}}>상태</th>
              <th style={{textAlign: 'right'}}>수익률</th>
            </tr>
          </thead>
          <tbody>
            {data.stocks.map((stock, idx) => (
              <tr key={idx}>
                <td>
                  <div style={{fontWeight: 800, color: '#fff', fontSize: '1rem'}}>{stock.name}</div>
                  <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '0.05em'}}>{stock.code}</div>
                </td>
                <td>
                  <div style={{fontSize: '0.9rem', fontWeight: 600, color: '#ccc'}}>
                    {(stock.targets?.entry_1st || 0).toLocaleString()}원
                  </div>
                  <div style={{fontSize: '0.65rem', color: '#555'}}>Low: {(stock.market_data?.low || 0).toLocaleString()}원</div>
                </td>
                <td style={{textAlign: 'center'}}>
                  <span className={`lp-badge ${stock.status === 'EXECUTED' ? 'lp-badge-executed' : 'lp-badge-pending'}`}>
                    {stock.status === 'EXECUTED' ? '체결 완료' : '추적 중'}
                  </span>
                </td>
                <td style={{textAlign: 'right'}}>
                  <div className={stock.yield_pct >= 0 ? 'lp-profit-up' : 'lp-profit-down'} style={{fontSize: '1.2rem'}}>
                    {stock.yield_pct >= 0 ? '+' : ''}{stock.yield_pct}%
                  </div>
                  <div style={{fontSize: '0.65rem', color: '#555'}}>Max: +{stock.max_yield_pct || 0}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer */}
      <div className="lp-report-footer">
          <span>* 실시간 체결가는 KIS API 연동 공식 데이터입니다.</span>
          <span>Last Updated: {new Date(data.header?.generated_at || Date.now()).toLocaleTimeString()}</span>
      </div>
    </motion.div>
  );
};

export default MPStockDailyReport;
