const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const filesToHash = [
  path.join(__dirname, '..', 'server.cjs'),
  path.join(__dirname, '..', 'analyzer.cjs')
];

const hash = crypto.createHash('sha256');

for (const file of filesToHash) {
  const content = fs.readFileSync(file, 'utf8');
  hash.update(content);
}

console.log('NEW_HASH=' + hash.digest('hex'));
