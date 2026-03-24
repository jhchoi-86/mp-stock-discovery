const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./data/live_signals.json', 'utf8'));

// Check how many stocks have 1D or 1W trigger_vol = true
const stocks1D = data.filter(s => s.timeframe === '1D' && s.trigger_vol === true);
const stocks1W = data.filter(s => s.timeframe === '1W' && s.trigger_vol === true);

console.log(`1D Trigger Vol True: ${stocks1D.length}`);
console.log(`1W Trigger Vol True: ${stocks1W.length}`);

// Print a few 1D stocks with trigger_vol = true
if (stocks1D.length > 0) {
  console.log("Samples of 1D trigger_vol = true:");
  console.log(stocks1D.slice(0, 3).map(s => s.name));
}

// Print total 1D and 1W signals fetched
const total1D = data.filter(s => s.timeframe === '1D');
const total1W = data.filter(s => s.timeframe === '1W');
console.log(`Total 1D Signals: ${total1D.length}`);
console.log(`Total 1W Signals: ${total1W.length}`);
