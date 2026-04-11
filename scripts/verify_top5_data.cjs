const { fetchNaverBasic, fetchNaverSupply, formatSupply } = require('../src/utils/supplyRepair.cjs');
const https = require('https');

const stocks = [
    { name: "GS건설", code: "006360" },
    { name: "DL이앤씨", code: "375500" },
    { name: "대우건설", code: "047040" },
    { name: "삼성전기", code: "009150" },
    { name: "롯데케미칼", code: "011170" }
];

async function fetchExtra(code) {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    return new Promise((resolve) => {
        https.get(url, (resp) => {
            let data = '';
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({
                        tradeAmount: parseInt(String(json.totalTradeAmount || '0').replace(/,/g, '')) * 1000000, // 백만 단위 보정 (보통 백만 단위로 옴)
                        accumulatedTradingVolume: parseInt(String(json.accumulatedTradingVolume || '0').replace(/,/g, ''))
                    });
                } catch (e) { resolve({}); }
            });
        }).on("error", () => resolve({}));
    });
}

async function verify() {
    console.log('--- Top 5 Verification Report (v8.8.28) ---');
    for (const s of stocks) {
        const basic = await fetchNaverBasic(s.code);
        const supply = await fetchNaverSupply(s.code);
        const extra = await fetchExtra(s.code);

        console.log(`\n[${s.name} (${s.code})]`);
        console.log(`Current Price: ${basic ? basic.price.toLocaleString() : 'N/A'}원 (${basic ? basic.rate : 'N/A'}%)`);
        console.log(`Supply (Foreign/Inst): ${supply ? formatSupply(supply.foreign) : 'N/A'} / ${supply ? formatSupply(supply.inst) : 'N/A'}`);
        console.log(`Trade Amount: ${extra.tradeAmount ? extra.tradeAmount.toLocaleString() : 'N/A'}원`);
    }
}

verify();
