const fs = require('fs');
const filePath = '/home/ubuntu/mp-stock-discovery/src/components/WatchlistStrategyBanner.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update hardcoded data to Numbers (v8.4.3)
content = content.replace(/foreign: "\+12,500"/, 'foreign: 12500');
content = content.replace(/inst: "\+45,000"/, 'inst: 45000');

// 2. Surgical replacement of the rendering block
const oldBlock = `<div style={{ marginTop: '0.4rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 거래량 (전일 대비)
                                        </span>
                                        <span style={{ color: stock.volume === '증가' ? '#ff6b6b' : '#339af0', fontWeight: 700 }}>{stock.volume}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 {String(stock.foreign).startsWith('-') ? '외국인 순매도' : '외국인 순매수'}
                                        </span>
                                        <span style={{ color: String(stock.foreign).includes('+') ? '#ff6b6b' : (String(stock.foreign).includes('-') ? '#339af0' : '#fff'), fontWeight: 600 }}>{stock.foreign}{String(stock.foreign).endsWith('주') ? '' : '주'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 {String(stock.inst).startsWith('-') ? '기관 순매도' : '기관 순매수'}
                                        </span>
                                        <span style={{ color: String(stock.inst).includes('+') ? '#ff6b6b' : (String(stock.inst).includes('-') ? '#339af0' : '#fff'), fontWeight: 600 }}>{stock.inst}{String(stock.inst).endsWith('주') ? '' : '주'}</span>
                                    </div>
                                </div>`;

const newBlock = `<div style={{ marginTop: '0.4rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 거래량 (전일 대비)
                                        </span>
                                        <span style={{ color: stock.volume === '증가' ? '#ff6b6b' : '#339af0', fontWeight: 700 }}>{stock.volume}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 {Number(String(stock.foreign).replace(/[^0-9.-]/g, '')) < 0 ? '외국인 순매도' : '외국인 순매수'}
                                        </span>
                                        {(() => {
                                            const val = Number(String(stock.foreign).replace(/[^0-9.-]/g, ''));
                                            const color = val > 0 ? '#EF4444' : (val < 0 ? '#339af0' : '#fff');
                                            const sign = val > 0 ? '+' : '';
                                            return (
                                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>
                                                    {sign}{val.toLocaleString()}주
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            📊 기관 {Number(String(stock.inst).replace(/[^0-9.-]/g, '')) < 0 ? '기관 순매도' : '기관 순매수'}
                                        </span>
                                        {(() => {
                                            const val = Number(String(stock.inst).replace(/[^0-9.-]/g, ''));
                                            const color = val > 0 ? '#EF4444' : (val < 0 ? '#339af0' : '#fff');
                                            const sign = val > 0 ? '+' : '';
                                            return (
                                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>
                                                    {sign}{val.toLocaleString()}주
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>`;

if (content.indexOf(oldBlock) !== -1) {
    fs.writeFileSync(filePath, content.replace(oldBlock, newBlock), 'utf8');
    console.log('[Patch] WatchlistStrategyBanner.jsx updated surgically.');
} else {
    // If exact match fails, try a fuzzy match or re-cat to check
    console.log('[Error] Exact block match failed. Writing fuzzy patch...');
    // (Omitted for brevity, I'll check the output)
}
