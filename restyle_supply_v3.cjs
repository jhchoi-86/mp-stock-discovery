const fs = require('fs');

const files = [
    '/home/ubuntu/mp-stock-discovery/src/components/Top5StrategyBanner.jsx',
    '/home/ubuntu/mp-stock-discovery/src/components/WatchlistStrategyBanner.jsx'
];

files.forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Label 스타일 변경 (외국인/기관 라벨)
    // <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
    //     📊 외국인 {String(stock.foreign).startsWith('-') ? '순매도' : '순매수'}
    // </span>
    
    // 2. 값 스타일 및 로직 변경
    // <span style={{ color: String(stock.foreign).includes('+') ? '#ff6b6b' : (String(stock.foreign).includes('-') ? '#339af0' : '#fff'), fontWeight: 600 }}>{stock.foreign}{String(stock.foreign).endsWith('주') ? '' : '주'}</span>

    // New Helper to make code cleaner
    const formatValue = (key) => {
        return `{(() => {
                                            const val = Number(String(stock.${key}).replace(/[^0-9.-]/g, ''));
                                            const color = val > 0 ? '#EF4444' : (val < 0 ? '#339af0' : '#fff');
                                            const sign = val > 0 ? '+' : '';
                                            return (
                                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color }}>
                                                    {sign}{val.toLocaleString()}주
                                                </span>
                                            );
                                        })()}`;
    };

    const replaceSupplyBlock = (targetKey) => {
        const regex = new RegExp(
            `📊 (외국인|기관) \\{String\\(stock\\.${targetKey}\\)\\.startsWith\\('\\-'\\) \\? '(순매도|순매수)' : '(순매도|순매수)'\\}[\\s\\S]*?<span style=\\{\\{ color: String\\(stock\\.${targetKey}\\)\\.includes\\('[\\s\\S]*?\\{stock\\.${targetKey}\\}\\{String\\(stock\\.${targetKey}\\)\\.endsWith\\('주'\\) \\? '' : '주'\\}</span>`,
            'g'
        );
        
        content = content.replace(regex, (match, type) => {
            return `📊 ${type} {Number(String(stock.${targetKey}).replace(/[^0-9.-]/g, '')) < 0 ? '순매도' : '순매수'}
                                        </span>
                                        ${formatValue(targetKey)}`;
        });
    };

    replaceSupplyBlock('foreign');
    replaceSupplyBlock('inst');

    // 3. Update Hardcoded Interest Stock (WatchlistStrategyBanner.jsx)
    if (filePath.includes('WatchlistStrategyBanner.jsx')) {
        content = content.replace(/foreign: "\+12,500"/, 'foreign: 12500');
        content = content.replace(/inst: "\+45,000"/, 'inst: 45000');
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[Restyle] ${filePath} updated.`);
});
