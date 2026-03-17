const getKSTDateString = (timestampMs) => { 
    const date = new Date(timestampMs); 
    date.setUTCHours(date.getUTCHours() + 9); 
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`; 
}; 

const now = Date.now();
const yahooLastTime = 1710633600000; // An Example Yahoo Timestamp (1d interval timestamp)

console.log('now:', getKSTDateString(now)); 
console.log('yahoo (example):', getKSTDateString(yahooLastTime));
