const fs = require('fs');
const content = fs.readFileSync('c:/Users/danbe/Documents/Antigravity/주식종목발굴/server.cjs', 'utf8');
let stack = [];
let openCount = 0;
let closeCount = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') openCount++;
    if (content[i] === '}') closeCount++;
}
console.log(`Open: ${openCount}, Close: ${closeCount}`);
