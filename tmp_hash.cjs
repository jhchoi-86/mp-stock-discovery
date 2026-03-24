const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const hash = crypto.createHash('sha256');
const filesToHash = [
    path.join(__dirname, 'server.cjs'),
    path.join(__dirname, 'analyzer.cjs')
];
for (const file of filesToHash) {
    const content = fs.readFileSync(file, 'utf8');
    hash.update(content);
}
const actualHash = hash.digest('hex');
console.log("NEW HASH:", actualHash);

let envContent = fs.readFileSync('.env', 'utf8');
envContent = envContent.replace(/CORE_INTEGRITY_HASH=.*/g, `CORE_INTEGRITY_HASH=${actualHash}`);
fs.writeFileSync('.env', envContent);
console.log("Updated .env with new integrity hash.");
