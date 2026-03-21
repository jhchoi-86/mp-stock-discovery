const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(path.join(__dirname, 'server.cjs'), 'utf8'));
hash.update(fs.readFileSync(path.join(__dirname, 'analyzer.cjs'), 'utf8'));
const newHash = hash.digest('hex');

const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

if (envContent.includes('CORE_INTEGRITY_HASH=')) {
  envContent = envContent.replace(/^CORE_INTEGRITY_HASH=.*$/m, `CORE_INTEGRITY_HASH=${newHash}`);
} else {
  envContent += `\nCORE_INTEGRITY_HASH=${newHash}\n`;
}

fs.writeFileSync(envPath, envContent);
console.log('Successfully updated CORE_INTEGRITY_HASH to ' + newHash);
