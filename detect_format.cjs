const fs = require('fs');
const path = require('path');

function detectAndRead(filePath) {
    console.log(`--- Checking: ${filePath} ---`);
    const buffer = fs.readFileSync(filePath);
    
    // Check if it's UTF-16LE or similar (common in Excel exports)
    const contentUtf16 = buffer.toString('utf16le');
    if (contentUtf16.includes('<table') || contentUtf16.includes('<html>') || contentUtf16.includes('\t')) {
        console.log('Detected likely UTF-16 text (HTML or TSV)');
        console.log(contentUtf16.slice(0, 1000));
        return;
    }

    const contentUtf8 = buffer.toString('utf8');
    if (contentUtf8.includes('<table') || contentUtf8.includes('<html>') || contentUtf8.includes(',')) {
        console.log('Detected likely UTF-8 text (HTML or CSV)');
        console.log(contentUtf8.slice(0, 1000));
        return;
    }

    console.log('Likely Binary or unknown format. First 100 bytes (hex):');
    console.log(buffer.slice(0, 100).toString('hex'));
}

detectAndRead('C:\\Users\\danbe\\Downloads\\KOSPI200종목.xls');
detectAndRead('C:\\Users\\danbe\\Downloads\\KOSDAQ150종목.xls');
