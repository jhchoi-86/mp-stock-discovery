const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * [v8.6.3] File-only Supply Data Repair Script
 * Fetches real-time Foreigner/Institutional net purchase data from Naver
 * and synchronizes it to local JSON (latest.json) ONLY.
 * Use this when DB connectivity is not available.
 */

async function fetchNaverSupply(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/integration`;
    return new Promise((resolve, reject) => {
        https.get(url, (resp) => {
            let data = '';
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json && json.dealTrendInfos && json.dealTrendInfos.length > 0) {
                        const todayTrend = json.dealTrendInfos[0];
                        const safeParse = (str) => parseInt(String(str || '0').replace(/,/g, '')) || 0;
                        resolve({
                            foreign: safeParse(todayTrend.foreignerPureBuyQuant),
                            inst: safeParse(todayTrend.organPureBuyQuant)
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on("error", (err) => {
            reject(err);
        });
    });
}

async function main() {
    const todayKst = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const todayStr = todayKst.toISOString().split('T')[0];
    const displayDate = `${String(todayKst.getUTCMonth() + 1).padStart(2, '0')}. ${String(todayKst.getUTCDate()).padStart(2, '0')}.`;
    
    console.log(`[Repair-FileOnly] Starting file-based repair for ${todayStr}...`);

    const latestPath = path.join(__dirname, 'data/vip_logs/latest.json');
    if (!fs.existsSync(latestPath)) {
        console.error(`[Repair-FileOnly] File not found: ${latestPath}`);
        return;
    }

    const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    const stocks = latest.stocks || [];

    console.log(`[Repair-FileOnly] Processing ${stocks.length} stocks from latest.json...`);

    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        try {
            console.log(`[Repair-FileOnly] Fetching Naver data for ${stock.name} (${stock.code})...`);
            const supply = await fetchNaverSupply(stock.code);
            
            if (supply) {
                stocks[i].foreign_buy = (supply.foreign > 0 ? '+' : '') + supply.foreign.toLocaleString() + '주';
                stocks[i].inst_buy = (supply.inst > 0 ? '+' : '') + supply.inst.toLocaleString() + '주';
                
                // Ensure score is correct (preserving existing high scores in latest.json)
                console.log(`[Repair-FileOnly] Updated ${stock.name} -> F:${supply.foreign}, I:${supply.inst}`);
            } else {
                console.warn(`[Repair-FileOnly] No data found for ${stock.name}`);
            }
            
            await new Promise(r => setTimeout(r, 100)); // Rate limit safety
        } catch (e) {
            console.error(`[Repair-FileOnly] Error for ${stock.code}:`, e.message);
        }
    }

    latest.stocks = stocks;
    latest.header.report_date = displayDate;

    const output = JSON.stringify(latest, null, 2);
    fs.writeFileSync(latestPath, output);
    fs.writeFileSync(path.join(__dirname, `data/vip_logs/${todayStr}.json`), output);

    console.log(`[Repair-FileOnly] Successfully updated latest.json and ${todayStr}.json`);
    console.log(`[Repair-FileOnly] DONE.`);
}

main().catch(err => console.error(err));
