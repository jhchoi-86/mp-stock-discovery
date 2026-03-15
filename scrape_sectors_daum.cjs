const fs = require('fs');

async function updateSectors() {
    const stocksFile = 'data/stock_master.json';
    const stocks = JSON.parse(fs.readFileSync(stocksFile, 'utf8'));
    
    console.log(`Starting to scrape sectors from Daum Finance for ${stocks.length} stocks...`);
    
    let updatedCount = 0;
    
    // Process one by one to avoid rate limits, or quick batches
    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        try {
            const url = `https://finance.daum.net/api/quotes/A${stock.code}?summary=false&changeStatistics=true`;
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': `https://finance.daum.net/quotes/A${stock.code}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.wicsSectorName) {
                    stock.sector = data.wicsSectorName;
                    updatedCount++;
                } else {
                    stock.sector = '기타';
                }
            } else {
                stock.sector = '기타';
            }
        } catch (e) {
            stock.sector = '기타';
        }
        
        // Slight delay to be polite
        await new Promise(r => setTimeout(r, 50));
        
        if (i > 0 && i % 50 === 0) {
            console.log(`Processed ${i} / ${stocks.length} stocks...`);
        }
    }
    
    fs.writeFileSync(stocksFile, JSON.stringify(stocks, null, 2));
    console.log(`Done! Sector updated for ${updatedCount} stocks.`);
}

updateSectors();
