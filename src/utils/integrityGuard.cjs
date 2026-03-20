const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function verifyIntegrity() {
  const expectedHash = process.env.CORE_INTEGRITY_HASH;
  if (!expectedHash) {
    console.warn('⚠️ CORE_INTEGRITY_HASH가 설정되지 않았습니다. 무결성 검증을 건너뜁니다.');
    return;
  }

  const filesToHash = [
    path.join(__dirname, '..', '..', 'server.cjs'),
    path.join(__dirname, '..', '..', 'analyzer.cjs')
  ];

  const hash = crypto.createHash('sha256');
  
  for (const file of filesToHash) {
    if (!fs.existsSync(file)) {
      console.error(`❌ 치명적인 시스템 오류: 핵심 파일이 누락되었습니다 (${path.basename(file)})`);
      process.exit(1);
    }
    const content = fs.readFileSync(file, 'utf8');
    hash.update(content);
  }

  const actualHash = hash.digest('hex');

  if (actualHash !== expectedHash) {
    console.error('\n🚨 [SECURITY ALERT] 소스코드 무단 변조가 감지되었습니다! 🚨');
    console.error('핵심 알고리즘 파일(server.cjs, analyzer.cjs)의 무결성 검증을 통과하지 못했습니다.');
    console.error('불법 복제 및 탈취 방지를 위해 서버 구동을 즉각 영구 차단합니다.\n');
    process.exit(1);
  } else {
    console.log('🛡️ MP Stock 무결성 검증 통과 (소스코드 원본 확인)');
  }
}

module.exports = { verifyIntegrity };
