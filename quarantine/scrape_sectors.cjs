const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

async function scrapeSectors() {
    const stocksFile = 'data/stock_master.json';
    const stocks = JSON.parse(fs.readFileSync(stocksFile, 'utf8'));
    
    console.log(`Starting to scrape sectors for ${stocks.length} stocks...`);
    
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const BATCH_SIZE = 10;
    
    let updatedCount = 0;
    
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (stock) => {
            try {
                const url = `https://finance.naver.com/item/main.naver?code=${stock.code}`;
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                const html = iconv.decode(response.data, 'EUC-KR');
                const $ = cheerio.load(html);
                
                // Find <h4 class="h_sub sub_tit7" title="WICS"> -> <a> text
                const wicsTag = $('h4[title="WICS"] a');
                if (wicsTag.length > 0) {
                    const sector = wicsTag.text().trim();
                    stock.sector = sector;
                    updatedCount++;
                } else {
                    // Fallback to "업종" tag
                    const upjongTag = $('dt:contains("업종")').parent().find('dd a');
                    if (upjongTag.length > 0) {
                        stock.sector = upjongTag.text().trim();
                        updatedCount++;
                    } else {
                        stock.sector = '기타';
                    }
                }
            } catch (err) {
                console.error(`Error scraping ${stock.code}: ${err.message}`);
                stock.sector = '기타';
            }
        }));
        
        console.log(`Processed ${Math.min(i + BATCH_SIZE, stocks.length)} / ${stocks.length}`);
        await sleep(200);
    }
    
    fs.writeFileSync(stocksFile, JSON.stringify(stocks, null, 2));
    console.log(`Done! Sector updated for ${updatedCount} stocks.`);
}

scrapeSectors();
