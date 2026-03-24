const yf = require('yahoo-finance2');

async function test() {
    try {
        console.log("Keys of yf: ", Object.keys(yf));
        console.log("typeof yf.default: ", typeof yf.default);
        if (yf.default) console.log("Keys of yf.default: ", Object.keys(yf.default));

        let quoteInstance = yf.default;
        
        try {
            await quoteInstance.quote('005930.KS');
            console.log("yf.default.quote works!");
        } catch(e) {
            console.error("yf.default.quote error:", e.message);
            if (yf.default.default) {
                console.log("Trying yf.default.default...");
                await yf.default.default.quote('005930.KS');
                console.log("yf.default.default.quote works!");
            } else if (yf.default.YahooFinance) {
                 const inst = new yf.default.YahooFinance();
                 await inst.quote('005930.KS');
                 console.log("new yf.default.YahooFinance() works!");
            } else {
                 const { YahooFinance } = require('yahoo-finance2');
                 const inst = new YahooFinance();
                 await inst.quote('005930.KS');
                 console.log("new YahooFinance() works from root!");
            }
        }
    } catch(e) {
        console.error("Final error:", e.message);
    }
}
test();
