const https = require('https');

async function testNaverBasic(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log('Stock Name:', json.stockName);
                    // Mobile basic API fields
                    console.log('Close Price:', json.closePrice);
                    console.log('Fluctuations Ratio:', json.fluctuationsRatio);
                    console.log('Day over Day:', json.compareToPreviousClosePrice);
                    resolve(json);
                } catch(e) { console.error(e); resolve(null); }
            });
        }).on('error', resolve);
    });
}

testNaverBasic('028050');
