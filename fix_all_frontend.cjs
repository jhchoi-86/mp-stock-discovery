const fs = require('fs');

const files = [
    '/home/ubuntu/mp-stock-discovery/src/components/Top5StrategyBanner.jsx',
    '/home/ubuntu/mp-stock-discovery/src/components/WatchlistStrategyBanner.jsx'
];

files.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.log(`[Skip] ${filePath} not found.`);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace .startsWith with .toString().startsWith
    // Replace .includes with .toString().includes
    // Replace .endsWith with .toString().endsWith
    
    let patched = content;
    
    // Handle .startsWith('-')
    patched = patched.replace(/stock\.foreign\.startsWith\('\-'\)/g, "String(stock.foreign).startsWith('-')");
    patched = patched.replace(/stock\.inst\.startsWith\('\-'\)/g, "String(stock.inst).startsWith('-')");
    
    // Handle .includes('+') and .includes('-')
    patched = patched.replace(/stock\.foreign\.includes\('\+'\)/g, "String(stock.foreign).includes('+')");
    patched = patched.replace(/stock\.foreign\.includes\('\-'\)/g, "String(stock.foreign).includes('-')");
    patched = patched.replace(/stock\.inst\.includes\('\+'\)/g, "String(stock.inst).includes('+')");
    patched = patched.replace(/stock\.inst\.includes\('\-'\)/g, "String(stock.inst).includes('-')");
    
    // Handle .endsWith('주')
    patched = patched.replace(/stock\.foreign\.endsWith\('주'\)/g, "String(stock.foreign).endsWith('주')");
    patched = patched.replace(/stock\.inst\.endsWith\('주'\)/g, "String(stock.inst).endsWith('주')");

    if (content !== patched) {
        fs.writeFileSync(filePath, patched, 'utf8');
        console.log(`[Patch] ${filePath} fixed.`);
    } else {
        console.log(`[Patch] ${filePath} already fixed or pattern not found.`);
    }
});
