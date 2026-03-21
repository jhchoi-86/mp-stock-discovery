const code = '005930';
fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
    headers: {
        'User-Agent': 'Mozilla/5.0'
    }
})
.then(r => r.json())
.then(data => {
    console.log("Keys:", Object.keys(data));
    console.log("stockEndType:", data.stockEndType);
    console.log("Sector:", data.sector);
    console.log("WICS:", data.wics);
})
.catch(console.error);
