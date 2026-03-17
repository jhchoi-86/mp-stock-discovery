const fs = require('fs');
const https = require('https');

const masterData = JSON.parse(fs.readFileSync('data/stock_master.json', 'utf8'));
const updateMasterPath = 'update_master.cjs';
let updateMasterCode = fs.readFileSync(updateMasterPath, 'utf8');

const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

async function getStockName(code) {
    return new Promise(async (resolve) => {
        try {
            const url = `https://finance.naver.com/item/main.naver?code=${code}`;
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                  'User-Agent': 'Mozilla/5.0'
                }
            });
            const html = iconv.decode(response.data, 'EUC-KR');
            const $ = cheerio.load(html);
            const title = $('title').text();
            if (title && title.includes(':')) {
                const name = title.split(':')[0].trim();
                resolve(name);
            } else {
                resolve(null);
            }
        } catch (e) {
            resolve(null);
        }
    });
}

async function run() {
    let changed = false;
    for (const stock of masterData) {
        console.log(`Fetching name for ${stock.code}...`);
        const name = await getStockName(stock.code);
        if (name && name !== stock.name) {
            console.log(`Found: ${stock.code} -> ${name}`);
            stock.name = name;
            changed = true;
        } else {
            console.log(`Kept or couldn't find name for ${stock.code}`);
        }
        // Sleep slightly to avoid rate limit
        await new Promise(r => setTimeout(r, 100));
    }
    
    if (changed) {
        fs.writeFileSync('data/stock_master.json', JSON.stringify(masterData, null, 2));
        fs.writeFileSync(updateMasterPath, updateMasterCode);
        console.log('Successfully updated the names in stock_master.json and update_master.cjs');
    } else {
        console.log('No missing names found or fetched.');
    }
}

run();
