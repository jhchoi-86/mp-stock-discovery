const fs = require('fs');

function extractStockData(filePath) {
    const buffer = fs.readFileSync(filePath);
    const codes = new Set();
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
        if (isCode) codes.add(code);
    }
    return Array.from(codes);
}

const kospi = extractStockData('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls');
const kosdaq = extractStockData('C:\\Users\\danbe\\Downloads\\KOSDAQ150종목.xls');

fs.writeFileSync('data/codes_full.json', JSON.stringify({ kospi, kosdaq }, null, 2));
console.log('Saved 348 codes to data/codes_full.json');
