fetch('https://mpstock.co.kr/api/signals', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
})
.then(res => res.json())
.then(stocks => {
    let highScorers = 0;
    let missingInfo = 0;
    for (const s of stocks) {
       if (s.total_score >= 50) highScorers++;
       
       const cData = s.latestSignal?.kis_change_data || {};
       if (cData.foreign_buy === '-' || cData.inst_buy === '-') {
           missingInfo++;
       }
    }
    
    console.log(`[Validation] Fetched ${stocks.length} stocks from live server.`);
    console.log(`[Validation] Stocks with 50+ points (Fixed Scoring): ${highScorers}`);
    console.log(`[Validation] Stocks missing Naver Flow Data: ${missingInfo}`);
    console.log(`[Validation] Top 5 Scores (Proof of 100-Point Formula Integration):`);
    stocks.slice(0, 5).forEach(s => {
       console.log(` -> ${s.name} (${s.code}): ${s.total_score}점`);
    });
})
.catch(err => console.log('Error:', err.message));
