const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const filesToHash = [
    path.join(__dirname, 'server.cjs'),
    path.join(__dirname, 'analyzer.cjs')
];
const hash = crypto.createHash('sha256');
for (const file of filesToHash) {
    const content = fs.readFileSync(file, 'utf8');
    hash.update(content);
}
const newHash = hash.digest('hex');
console.log("New Hash:", newHash);

let envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
if (envContent.includes('CORE_INTEGRITY_HASH=')) {
    envContent = envContent.replace(/CORE_INTEGRITY_HASH=.*/, `CORE_INTEGRITY_HASH=${newHash}`);
} else {
    envContent += `\nCORE_INTEGRITY_HASH=${newHash}\n`;
}
fs.writeFileSync(path.join(__dirname, '.env'), envContent);
console.log("Updated .env with new hash!");
