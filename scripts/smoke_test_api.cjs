const axios = require('axios');

async function test(url, method = 'get') {
    try {
        const res = await axios({ method, url, validateStatus: () => true });
        console.log(`${url}: ${res.status}`);
    } catch (e) {
        console.log(`${url}: ERROR (${e.message})`);
    }
}

async function run() {
    console.log('--- API Smoke Test ---');
    await test('http://localhost:3000/');
    await test('http://localhost:3000/api/ppp/watchlist');
    await test('http://localhost:3000/api/ppp/price-update', 'post');
    console.log('\n--- Alternative Port Check (3001) ---');
    await test('http://localhost:3001/');
    await test('http://localhost:3001/api/ppp/watchlist');
}
run();
