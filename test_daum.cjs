const code = '005930';
fetch(`https://finance.daum.net/api/quotes/A${code}?summary=false&changeStatistics=true`, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': `https://finance.daum.net/quotes/A${code}`
    }
})
.then(r => r.json())
.then(data => {
    console.log("Daum Keys:", Object.keys(data));
    console.log("Sector info:", data.companySummary ? data.companySummary.wicsSectorName : data.sectorCode);
    console.log(data);
})
.catch(console.error);
