const https = require('https');

const code = '036930'; // 주성엔지니어링
const url = `https://m.stock.naver.com/api/stock/${code}/integration`;

https.get(url, (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('--- Naver API Response ---');
      if (json && json.dealTrendInfos && json.dealTrendInfos.length > 0) {
          const todayTrend = json.dealTrendInfos[0];
          console.log(`Foreigner Buy: ${todayTrend.foreignerPureBuyQuant}`);
          console.log(`Institution Buy: ${todayTrend.organPureBuyQuant}`);
          console.log(`Individual Buy: ${todayTrend.individualPureBuyQuant}`);
      } else {
          console.log('No dealTrendInfos found in response.');
          console.dir(Object.keys(json));
      }
    } catch(e) {
      console.log('Parsing Error:', e.message);
    }
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
