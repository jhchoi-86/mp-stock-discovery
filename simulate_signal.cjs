const fs = require('fs');
const http = require('http');

const data_dir = './data';
const stock_master_file = `${data_dir}/stock_master.json`;

if (!fs.existsSync(stock_master_file)) {
    console.error("Stock master file not found!");
    process.exit(1);
}

const stocks = JSON.parse(fs.readFileSync(stock_master_file, 'utf8'));
console.log(`Loaded ${stocks.length} stocks for simulation.`);

// Select 60 random stocks to simulate signals for
const targetStocks = stocks.sort(() => 0.5 - Math.random()).slice(0, 60);

function sendSignal(stock) {
    const isDHH2 = Math.random() > 0.4;
    const progress = Math.random();
    // signal_HH is auto-calculated by server if omitted, 
    // but let's send it sometimes to test logic override
    const signal_HH = isDHH2 && progress > 0.3;

    const data = JSON.stringify({
        code: stock.code,
        result_2: Math.random() * 100,
        result_3: Math.random() * 100,
        cond_up7: Math.random() > 0.3,
        DHH2: isDHH2,
        progress: progress,
        signal_HH: signal_HH
    });

    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/webhook',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        // console.log(`Sent signal for ${stock.name} (${stock.code}): ${res.statusCode}`);
    });

    req.on('error', (error) => {
        console.error(`Error sending signal for ${stock.name}:`, error.message);
    });

    req.write(data);
    req.end();
}

console.log(`Sending signals for ${targetStocks.length} stocks...`);
targetStocks.forEach((stock, index) => {
    setTimeout(() => sendSignal(stock), index * 100); // Stagger requests
});

setTimeout(() => {
    console.log("Simulation batch sent.");
}, targetStocks.length * 100 + 1000);
