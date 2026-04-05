const axios = require('axios');
const iconv = require('iconv-lite');


async function getNaverFinalPrice(code) {
    const url = `https://finance.naver.com/item/sise_single.naver?code=${code}`;
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            responseType: 'arraybuffer'
        });
        const html = iconv.decode(res.data, 'EUC-KR');  // ← 올바른 디코딩
        
        const priceMatch = html.match(/<span class="tah p11 \w+">([\d,]+)<\/span>/);
        if (priceMatch) return parseInt(priceMatch[1].replace(/,/g, ''));

        
        // Fallback to main page if single price page is weird
        const mainUrl = `https://finance.naver.com/item/main.naver?code=${code}`;
        const mainRes = await axios.get(mainUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const mainHtml = mainRes.data.toString();
        const mainMatch = mainHtml.match(/<dd>현재가 ([\d,]+)/);
        if (mainMatch) return parseInt(mainMatch[1].replace(/,/g, ''));
        
    } catch (e) {
        console.error(`[Scraper] Error ${code}:`, e.message);
    }
    return null;
}

module.exports = { getNaverFinalPrice };
