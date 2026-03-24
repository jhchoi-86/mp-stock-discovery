const yahooFinance = require('yahoo-finance2').default;

async function test() {
    try {
        const quote = await yahooFinance.quote('005930.KS');
        console.log("Yahoo Close:", quote.regularMarketPrice);
    } catch(e) {
        console.error("Yahoo error:", e.message);
    }
}
test();
