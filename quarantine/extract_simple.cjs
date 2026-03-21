const fs = require('fs');

function extractCodesAndNames(filePath) {
    const buffer = fs.readFileSync(filePath);
    const content = buffer.toString('latin1'); // Use latin1 to not mangle any bytes
    
    // Look for 6-digit codes
    const codes = content.match(/\d{6}/g) || [];
    
    // Try to find Hangeul - Hangeul syllables in EUC-KR are 0xB0A1-0xC8FE
    // In UTF-16LE, they are 0xAC00-0xD7A3
    const names = [];
    
    // Let's just output the unique codes for now to see if we're on the right track
    const uniqueCodes = [...new Set(codes)];
    console.log(`Unique Codes found in ${filePath}: ${uniqueCodes.length}`);
    return uniqueCodes;
}

const kospiCodes = extractCodesAndNames('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls');
const kosdaqCodes = extractCodesAndNames('C:\\Users\\danbe\\Downloads\\KOSDAQ150종목.xls');

console.log('KOSPI Codes sample:', kospiCodes.slice(0, 20));
console.log('KOSDAQ Codes sample:', kosdaqCodes.slice(0, 20));
