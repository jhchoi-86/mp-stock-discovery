const fs = require('fs');
const path = require('path');

const PRICE_CACHE_FILE = path.join(__dirname, 'data', 'live_prices_full.json');

const TOP5_CODES = ['222800', '095610', '004020', '183300', '032640'];

if (fs.existsSync(PRICE_CACHE_FILE)) {
    const cache = JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, 'utf8'));
    const results = {};
    TOP5_CODES.forEach(code => {
        results[code] = cache[code];
    });
    console.log(JSON.stringify(results, null, 2));
} else {
    console.log('Price cache file not found');
}
