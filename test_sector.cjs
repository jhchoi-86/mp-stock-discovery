const stockCode = '005930';
const symbol = stockCode + '.KS';
const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=assetProfile`;

fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    .then(r => r.json())
    .then(data => {
        if(data.quoteSummary && data.quoteSummary.result) {
            console.log("Sector:", data.quoteSummary.result[0].assetProfile.sector);
            console.log("Industry:", data.quoteSummary.result[0].assetProfile.industry);
        } else {
            console.log("No data", data);
        }
    }).catch(console.error);
