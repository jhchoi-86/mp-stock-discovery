const fs = require('fs');

async function testMultiImport() {
    const csvContent = "Ticker,RSI(2),Signal\nKRX:005930,22,수\nKRX:000660,15,수\n";
    
    const tfs = ["1H", "4H", "1D", "1W"];
    
    for (const tf of tfs) {
        console.log(`Importing for ${tf}...`);
        try {
            const response = await fetch('http://localhost:3001/api/import-csv', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ csv: csvContent, timeframe: tf }),
            });
            
            const result = await response.json();
            console.log(`Result for ${tf}:`, result);
        } catch (error) {
            console.error(`Test for ${tf} failed:`, error);
        }
    }
}

testMultiImport();
