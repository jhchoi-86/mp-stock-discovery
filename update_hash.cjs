const fs = require('fs');
let env = fs.readFileSync('.env', 'utf8');
env = env.replace(/CORE_INTEGRITY_HASH=.*\n?/, 'CORE_INTEGRITY_HASH=b672fa616a091a8f3fa4f97b31bbcb02cf58f400f49e289e4259508653c3ef59\n');
fs.writeFileSync('.env', env);
console.log('Successfully updated CORE_INTEGRITY_HASH in .env');
