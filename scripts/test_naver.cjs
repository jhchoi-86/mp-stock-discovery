const axios = require('axios');
const code = process.argv[2] || '014620';

async function fetchNaverPrice(symbol) {
    const url = `https://finance.naver.com/item/main.naver?code=${symbol}`;
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = res.data;
        
        // Naver's price is usually in a div with class "no_today" or similar meta tags
        // Extraction via regex for speed/simplicity in a script
        const match = html.match(/<dd>현재가 ([\d,]+)/);
        if (match) {
            const price = parseInt(match[1].replace(/,/g, ''));
            console.log(`[Naver] ${symbol} Price: ${price}`);
            return price;
        } else {
            // Try another meta tag
            const matchMeta = html.match(/<meta property="og:description" content="[^"]*현재가 ([\d,]+)/);
            if (matchMeta) {
                const price = parseInt(matchMeta[1].replace(/,/g, ''));
                console.log(`[Naver Meta] ${symbol} Price: ${price}`);
                return price;
            }
        }
        console.log(`[Naver] Failed to find price for ${symbol}`);
    } catch (e) {
        console.error(`[Naver] Error fetching ${symbol}:`, e.message);
    }
}

fetchNaverPrice(code);
