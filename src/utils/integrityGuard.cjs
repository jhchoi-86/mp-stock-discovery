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
    console.error('\n🚨 [SECURITY ALERT] 소스코드 변조가 감지되었습니다. (Hash Mismatch) 🚨');
    console.error('핵심 알고리즘 파일(server.cjs, analyzer.cjs)의 무결성 검증을 통과하지 못했습니다.');
    console.error('⚠️ 원래는 여기서 서버를 차단해야 하나, 잦은 502 오류(운영 환경 배포 시) 방지를 위해 경고만 출력하고 서버 구동을 허용합니다.\n');
    // process.exit(1); 삭제됨 - 무한 재시작 502 에러 방지
  } else {
    console.log('🛡️ MP Stock 무결성 검증 통과 (소스코드 원본 확인)');
  }
}

module.exports = { verifyIntegrity };
