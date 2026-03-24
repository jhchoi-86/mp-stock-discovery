const crypto=require('crypto'),fs=require('fs');
let c=fs.readFileSync('.env','utf8');
const hash=crypto.createHash('sha256');
hash.update(fs.readFileSync('server.cjs'));
hash.update(fs.readFileSync('analyzer.cjs'));
const d = hash.digest('hex');
c=c.replace(/CORE_INTEGRITY_HASH=.*/, 'CORE_INTEGRITY_HASH='+d);
fs.writeFileSync('.env', c);
console.log('Successfully patched .env with new hash: ' + d);
