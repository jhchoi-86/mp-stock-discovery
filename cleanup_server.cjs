const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.cjs');
let content = fs.readFileSync(serverPath, 'utf8');

// Global replacement for the +9h hack to use getKstNow() or getKstDateString()
content = content.replace(/new Date\(Date\.now\(\) \+ \(?9 \* 60 \* 60 \* 1000\)?\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "getKstDateString()");
content = content.replace(/new Date\(Date\.now\(\) \+ \(?9 \* 60 \* 60 \* 1000\)?\)/g, "getKstNow()");

fs.writeFileSync(serverPath, content, 'utf8');
console.log('server.cjs final cleanup done.');
