const fs = require('fs');
const axios = require('axios');
const iconv = require('iconv-lite');

axios.get('https://finance.naver.com/item/main.naver?code=005930', {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0' }
}).then(res => {
    const html = iconv.decode(res.data, 'EUC-KR');
    fs.writeFileSync('naver_page.html', html);
    console.log("HTML length:", html.length);
}).catch(console.error);
