const https = require('https');

async function testNaverIntegration(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/integration`;
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // Print keys to find where the price is
                    console.log('Stock Name:', json.stockName);
                    // Price is usually in json.totalInfos or directly in the response
                    console.log('Keys:', Object.keys(json));
                    if (json.totalInfos) {
                        json.totalInfos.forEach(info => {
                            console.log(`- ${info.key}: ${info.value} (${info.code})`);
                        });
                    }
                    resolve(json);
                } catch(e) { console.error(e); resolve(null); }
            });
        }).on('error', resolve);
    });
}

testNaverIntegration('028050');
