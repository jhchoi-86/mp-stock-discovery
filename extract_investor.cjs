const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

async function testFetch() {
    try {
        const res = await axios.get('https://finance.naver.com/item/main.naver?code=005930', {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = iconv.decode(res.data, 'EUC-KR');
        const $ = cheerio.load(html);

        // find foreigner and institutional
        // In naver finance main, it's usually inside <div class="sub_section">
        // Specifically check `.spot .blind` or similar structure.
        
        let foreign = '0';
        let inst = '0';

        // Actually, Naver Finance main page has a table for 투자자별 매매동향
        // it usually has '외국인' and '기관' in th
        $('table.tb_type1 tbody tr').each((i, el) => {
            const text = $(el).text();
            if (text.includes('외국인')) {
                console.log('Foreign row:', $(el).text());
            }
            if (text.includes('기관')) {
                console.log('Inst row:', $(el).text());
            }
        });

        const foreignData = $('.sub_section .tb_type1 tbody tr th:contains("외국인")').parent().find('td span').text().trim();
        const instData = $('.sub_section .tb_type1 tbody tr th:contains("기관")').parent().find('td span').text().trim();
        
        console.log("Foreign:", foreignData);
        console.log("Inst:", instData);
        
    } catch (e) {
        console.error(e);
    }
}
testFetch();
