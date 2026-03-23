const fs = require('fs');
const crypto = require('crypto');

const files = ['server.cjs', 'analyzer.cjs'];
const hash = crypto.createHash('sha256');

for (const f of files) {
  hash.update(fs.readFileSync(f, 'utf8'));
}
const finalHash = hash.digest('hex');
console.log('NEW_HASH=' + finalHash);

let env = fs.readFileSync('.env', 'utf8');
if (env.includes('CORE_INTEGRITY_HASH=')) {
  env = env.replace(/CORE_INTEGRITY_HASH=.*/g, 'CORE_INTEGRITY_HASH=' + finalHash);
} else {
  env += '\nCORE_INTEGRITY_HASH=' + finalHash;
}
fs.writeFileSync('.env', env);
console.log('Successfully updated CORE_INTEGRITY_HASH in .env');
