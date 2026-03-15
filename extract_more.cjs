const fs = require('fs');

function extractMore(filePath) {
    const buffer = fs.readFileSync(filePath);
    const names = new Set();
    
    // Strategy 1: UTF-16LE Hangeul
    for (let i = 0; i < buffer.length - 1; i += 2) {
        const b1 = buffer[i];
        const b2 = buffer[i+1];
        if (b2 >= 0xAC && b2 <= 0xD7) {
            let j = i;
            let name = "";
            while (j < buffer.length - 1) {
                const c1 = buffer[j];
                const c2 = buffer[j+1];
                if (c2 >= 0xAC && c2 <= 0xD7) {
                    name += Buffer.from([c1, c2]).toString('utf16le');
                    j += 2;
                } else { break; }
            }
            if (name.length >= 2) names.add(name);
        }
    }

    // Strategy 2: EUC-KR Hangeul
    // EUC-KR: two bytes both >= 0xA1
    for (let i = 0; i < buffer.length - 1; i++) {
        const b1 = buffer[i];
        const b2 = buffer[i+1];
        if (b1 >= 0xA1 && b1 <= 0xFE && b2 >= 0xA1 && b2 <= 0xFE) {
            let j = i;
            let raw = [];
            while (j < buffer.length - 1) {
                const c1 = buffer[j];
                const c2 = buffer[j+1];
                if (c1 >= 0xA1 && c1 <= 0xFE && c2 >= 0xA1 && c2 <= 0xFE) {
                    raw.push(c1, c2);
                    j += 2;
                } else { break; }
            }
            if (raw.length >= 4) {
                // Try decoding with a library-less way or just skip for now
                // Actually, let's just mark these as potential names
            }
        }
    }

    return Array.from(names);
}

const kospi = extractMore('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls');
const kosdaq = extractMore('C:\\Users\\danbe\\Downloads\\KOSDAQ150종목.xls');

console.log('KOSPI count:', kospi.length);
console.log('KOSDAQ count:', kosdaq.length);
console.log('KOSPI sample:', kospi.slice(0, 50));
