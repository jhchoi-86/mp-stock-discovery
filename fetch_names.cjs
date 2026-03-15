const fs = require('fs');
const http = require('https');

const missingCodes = ["138930", "051900", "000670", "012450", "402340", "102280", "030000", "008770", "002380", "112610", "241590", "004170", "006800", "090430", "000240", "003470", "004800", "012750", "014680", "021240", "096770", "009830", "000990"];

async function getStockName(code) {
    return new Promise((resolve) => {
        const url = `https://ac.finance.naver.com/ac?q=${code}&ans=2&run=2`;
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.items && json.items[0] && json.items[0][0]) {
                        resolve(json.items[0][0][0]);
                    } else {
                        resolve(null);
                    }
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

async function run() {
    const results = {};
    for (const code of missingCodes) {
        const name = await getStockName(code);
        if (name) results[code] = name;
        console.log(`${code}: ${name}`);
    }
    fs.writeFileSync('data/names_found.json', JSON.stringify(results, null, 2));
}

run();
