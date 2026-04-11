const fs = require('fs');

const files = [
    '/home/ubuntu/mp-stock-discovery/src/components/Top5StrategyBanner.jsx',
    '/home/ubuntu/mp-stock-discovery/src/components/WatchlistStrategyBanner.jsx'
];

files.forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Pattern to find my previous v8.4.2 complex logic and replace its style
    // <span style={{ fontSize: '1.1rem', fontWeight: 800, color }}>
    
    content = content.replace(/fontSize: '1\.1rem', fontWeight: 800/g, "fontSize: '0.9rem', fontWeight: 700");

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[Restyle-v4] ${filePath} updated to 0.9rem/700.`);
});
