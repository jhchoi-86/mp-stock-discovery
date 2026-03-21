const fs = require('fs');

function extractStockData(filePath, market) {
    const buffer = fs.readFileSync(filePath);
    const results = [];
    
    // Look for 6-digit codes
    const codeRegex = /\d{6}/g;
    const content = buffer.toString('binary'); // Read as binary string to preserve bytes
    let match;
    
    while ((match = codeRegex.exec(content)) !== null) {
        const code = match[0];
        // Look for Hangeul nearby (roughly)
        // Hangeul syllables are in range AC00-D7A3
        // In binary/latin1, these are often encoded as pairs of bytes
        // We'll just look for a window around the code
        const start = Math.max(0, match.index - 50);
        const end = Math.min(content.length, match.index + 50);
        const window = buffer.slice(start, end);
        
        // Try various encodings to find Hangeul
        const nameUtf16 = window.toString('utf16le');
        const nameUtf8 = window.toString('utf8');
        
        // This is a naive extraction, but let's see what we get
        results.push({ code, raw: window.toString('hex') });
    }
    return results;
}

// Actually, let's try a better approach: search for the 350 list on the web and use it to verify the codes I found.
// The user's files are the source of truth, so I'll try to match them.

console.log(JSON.stringify(extractStockData('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls', 'KOSPI200').slice(0, 50)));
