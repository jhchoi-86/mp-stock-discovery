const fs = require('fs');

function extractStockRecords(filePath) {
    const buffer = fs.readFileSync(filePath);
    const codes = new Set();
    const names = new Set();

    // Strategy 1: Look for 6-digit ASCII codes
    const content = buffer.toString('latin1');
    const matches = content.match(/\d{6}/g);
    if (matches) matches.forEach(m => codes.add(m));

    // Strategy 2: Look for UTF-16LE Hangeul
    // Hangeul syllable: AC00 (0x00 0xAC) to D7A3 (0xA3 0xD7)
    // In UTF-16LE, Hangeul is 2 bytes: Byte1: 0x00-0xFF, Byte2: 0xAC-0xD7
    for (let i = 0; i < buffer.length - 1; i += 2) {
        const b1 = buffer[i];
        const b2 = buffer[i+1];
        if (b2 >= 0xAC && b2 <= 0xD7) {
            // Found a Hangeul-like character
            // Let's try to extract a string of them
            let j = i;
            let name = "";
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
            if (name.length >= 2) {
                names.add(name);
                i = j; // Skip forward
            }
        }
    }

    return {
        codes: Array.from(codes),
        names: Array.from(names)
    };
}

const kospi = extractStockRecords('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls');
const kosdaq = extractStockRecords('C:\\Users\\danbe\\Downloads\\KOSDAQ150종목.xls');

console.log('KOSPI count:', kospi.names.length, 'codes:', kospi.codes.length);
console.log('KOSPI sample names:', kospi.names.slice(0, 50));
console.log('KOSDAQ count:', kosdaq.names.length, 'codes:', kosdaq.codes.length);
console.log('KOSDAQ sample names:', kosdaq.names.slice(0, 50));
