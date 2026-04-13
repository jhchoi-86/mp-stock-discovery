#!/usr/bin/env node
const { execSync } = require('child_process');

const checks = [
  { name: '하드코딩 자격증명', cmd: "grep -rn --include='*.js' --include='*.cjs' -E '(appKey|appSecret)\\s*=' . --exclude-dir=node_modules | grep -v 'process\\.env'" },
  { name: '$queryRawUnsafe 사용', cmd: "grep -rn '\\$queryRawUnsafe' . --exclude-dir=node_modules" },
  { name: 'CORS wildcard', cmd: "grep -rn 'cors()' server.cjs" },
  { name: '투자 지시 문구', cmd: "grep -rn -E '(매수하세요|매도하세요)' . --include='*.js' --exclude-dir=node_modules" }
];

let totalIssues = 0;
for (const check of checks) {
  try {
    const result = execSync(check.cmd, { encoding: 'utf8' }).trim();
    if (result) {
      console.error(`❌ [${check.name}]\n${result}\n`);
      totalIssues++;
    } else {
      console.log(`✅ ${check.name}`);
    }
  } catch { console.log(`✅ ${check.name}`); }
}

console.log(`\n총 발견 이슈: ${totalIssues}건`);
process.exit(totalIssues > 0 ? 1 : 0);
