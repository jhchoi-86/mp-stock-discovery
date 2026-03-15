const fs = require('fs');

async function testAutoSync() {
    console.log("Testing Auto-Sync endpoint (Single Stock - Samsung 005930)...");
    
    try {
        const response = await fetch('http://localhost:3001/api/auto-sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ timeframe: '1D' }),
        });
        
        if (!response.ok) {
            const text = await response.text();
            console.error(`Sync failed with status ${response.status}:`, text);
            return;
        }
        
        try {
            const result = await response.json();
            console.log("Sync Result:", result);
        } catch (e) {
            const text = await response.text();
            console.error("Failed to parse JSON. Response text:", text);
            return;
        }
        
        // Check signals.json
        const signals = JSON.parse(fs.readFileSync('./data/signals.json', 'utf8'));
        const samsungSignals = signals.filter(s => s.code === '005930' && s.timeframe === '1D');
        console.log(`Samsung Signals Found: ${samsungSignals.length}`);
        if (samsungSignals.length > 0) {
            console.log("Latest Signal Details:", samsungSignals[samsungSignals.length - 1]);
        }
    } catch (error) {
        console.error("Auto-sync test failed:", error);
    }
}

testAutoSync();
