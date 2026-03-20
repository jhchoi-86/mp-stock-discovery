const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const filesToHash = [
  path.join(__dirname, 'server.cjs'),
  path.join(__dirname, 'analyzer.cjs')
];

const hash = crypto.createHash('sha256');

for (const file of filesToHash) {
  if (!fs.existsSync(file)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(file, 'utf8');
  hash.update(content);
}

const newHash = hash.digest('hex');
const envPath = path.join(__dirname, '.env');

let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

if (envContent.includes('CORE_INTEGRITY_HASH=')) {
  envContent = envContent.replace(/CORE_INTEGRITY_HASH=[^\n]*/g, `CORE_INTEGRITY_HASH=${newHash}`);
} else {
  envContent += `\nCORE_INTEGRITY_HASH=${newHash}\n`;
}

fs.writeFileSync(envPath, envContent);

console.log(`\n✅ MP Stock 소스코드 무결성 봉인(Seal) 완료!`);
console.log(`새로운 인증 해시: ${newHash}`);
console.log(`이제 본 서버는 무단 코드 변조로부터 완벽하게 보호됩니다.\n`);
