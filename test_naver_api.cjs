const https = require('https');

async function testNaverIntegration(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/integration`;
    console.log(`Fetching ${url}...`);
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log('Price:', json.totalInfos?.[0]?.closePrice);
                    console.log('Full first item:', JSON.stringify(json.totalInfos?.[0], null, 2));
                    resolve(json);
                } catch(e) { console.error(e); resolve(null); }
            });
        }).on('error', resolve);
    });
}

testNaverIntegration('028050'); // 삼성E&A
