const fs = require('fs');

function extractStockPairs(filePath) {
    const buffer = fs.readFileSync(filePath);
    const results = [];

    // Helper to extract UTF-16LE 6-digit code at index
    function getCodeAt(idx) {
        let code = "";
        for (let j = 0; j < 6; j++) {
            const b1 = buffer[idx + j*2];
            const b2 = buffer[idx + j*2 + 1];
            if (b1 >= 0x30 && b1 <= 0x39 && b2 === 0x00) {
                code += String.fromCharCode(b1);
            } else {
                return null;
            }
        }
        return code;
    }

    // Helper to extract UTF-16LE Hangeul at index
    function getNameAt(idx) {
        let name = "";
        let j = idx;
        while (j < buffer.length - 1) {
            const c1 = buffer[j];
            const c2 = buffer[j+1];
            if (c2 >= 0xAC && c2 <= 0xD7) {
                name += Buffer.from([c1, c2]).toString('utf16le');
                j += 2;
            } else {
                break;
            }
        }
        return name.length >= 2 ? { name, end: j } : null;
    }

    // Scan for codes and look for names nearby
    for (let i = 0; i < buffer.length - 200; i += 2) {
        const code = getCodeAt(i);
        if (code) {
            // Found a code, look for a name within +/- 150 bytes
            let foundName = null;
            for (let offset = -150; offset <= 150; offset += 2) {
                const targetIdx = i + offset;
                if (targetIdx < 0 || targetIdx >= buffer.length - 1) continue;
                const nameInfo = getNameAt(targetIdx);
                if (nameInfo) {
                    foundName = nameInfo.name;
                    break;
                }
            }
            results.push({ code, name: foundName });
        }
    }
    
    // De-duplicate by code
    const unique = [];
    const seen = new Set();
    results.forEach(r => {
        if (!seen.has(r.code)) {
            unique.push(r);
            seen.add(r.code);
        }
    });
    return unique;
}

const kospi = extractStockPairs('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls');
const kosdaq = extractStockPairs('C:\\Users\\danbe\\Downloads\\KOSDAQ150종목.xls');

console.log('KOSPI count:', kospi.length);
console.log('KOSPI sample:', JSON.stringify(kospi.slice(0, 50), null, 2));
console.log('KOSDAQ count:', kosdaq.length);
console.log('KOSDAQ sample:', JSON.stringify(kosdaq.slice(0, 50), null, 2));
