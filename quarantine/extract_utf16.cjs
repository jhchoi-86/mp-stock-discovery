const fs = require('fs');

function extractStockData(filePath) {
    const buffer = fs.readFileSync(filePath);
    const codes = new Set();
    const names = new Set();

    // Strategy 1: UTF-16LE 6-digit codes
    // 6-digit codes: (digit 0x00) * 6 = 12 bytes
    for (let i = 0; i < buffer.length - 11; i++) {
        let isCode = true;
        let code = "";
        for (let j = 0; j < 6; j++) {
            const b1 = buffer[i + j*2];
            const b2 = buffer[i + j*2 + 1];
            if (b1 >= 0x30 && b1 <= 0x39 && b2 === 0x00) {
                code += String.fromCharCode(b1);
            } else {
                isCode = false;
                break;
            }
        }
        if (isCode) {
            codes.add(code);
        }
    }

    // Strategy 2: UTF-16LE Hangeul Names
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
                } else {
                    break;
                }
            }
            if (name.length >= 2 && name.length <= 20) {
                names.add(name);
                i = j;
            }
        }
    }

    return {
        codes: Array.from(codes),
        names: Array.from(names)
    };
}

const kospi = extractStockData('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls');
const kosdaq = extractStockData('C:\\Users\\danbe\\Downloads\\KOSDAQ150종목.xls');

console.log('KOSPI count - Names:', kospi.names.length, 'Codes:', kospi.codes.length);
console.log('KOSDAQ count - Names:', kosdaq.names.length, 'Codes:', kosdaq.codes.length);

// Print pairs if they are found close to each other
// Actually, let's just print unique codes and names to see if we have enough.
console.log('KOSPI Codes:', kospi.codes.slice(0, 20));
console.log('KOSPI Names:', kospi.names.slice(0, 20));
