const fs = require('fs');
const path = require('path');

const filePath = '/home/ubuntu/mp-stock-discovery/src/components/WatchlistStrategyBanner.jsx';
const content = fs.readFileSync(filePath, 'utf8');

const dlSnippet = `    // [v8.3.2] 오늘의 관심종목: DL이앤씨 (375500)
    const officialWatchlist = [
        {
            code: "375500",
            name: "DL이앤씨",
            score: 90,
            price: 77200,
            entryPrice1: 76428,
            entryPrice2: 73000,
            targetPrice: 81060,
            stopLoss: 71540,
            foreign: "+12,500",
            inst: "+45,000",
            volume: "증가"
        }
    ];`;

// Regex to find and replace the whole officialWatchlist array block
const regex = /\/\/ \[v7\.7\.42\][\s\S]*?const officialWatchlist = \[[\s\S]*?\];/;
const newContent = content.replace(regex, dlSnippet);

if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('[Patch] WatchlistStrategyBanner.jsx updated successfully.');
} else {
    console.log('[Patch] Could not find SK이노베이션 block to replace.');
}
