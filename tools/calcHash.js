const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '../server.cjs');
const analyzerPath = path.join(__dirname, '../src/utils/analyzer.cjs');

const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(serverPath));
hash.update(fs.readFileSync(analyzerPath));

console.log(hash.digest('hex'));
