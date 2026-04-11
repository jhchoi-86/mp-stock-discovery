const https = require('https');

/**
 * [v8.6.4] Naver Finance Supply Data Fetcher
 * Used as a fallback when KIS API (Investor) returns 429 or empty data.
 */

async function fetchNaverBasic(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    return new Promise((resolve) => {
        const req = https.get(url, (resp) => {
            let data = '';
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json && json.closePrice) {
                        resolve({
                            price: parseInt(String(json.closePrice).replace(/,/g, '')),
                            rate: parseFloat(json.fluctuationsRatio),
                            diff: parseInt(String(json.compareToPreviousClosePrice).replace(/,/g, ''))
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on("error", () => resolve(null));
        req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    });
}

async function fetchNaverSupply(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/integration`;
    return new Promise((resolve, reject) => {
        const req = https.get(url, (resp) => {
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
                    resolve(null); // Silent fail for single stock
                }
            });
        });
        
        req.on("error", (err) => {
            resolve(null);
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

function formatSupply(val) {
    if (val === 0) return '0주';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toLocaleString()}주`;
}

module.exports = {
    fetchNaverSupply,
    fetchNaverBasic,
    formatSupply
};
