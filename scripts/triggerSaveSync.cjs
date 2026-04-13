// scripts/triggerSaveSync.cjs
// 역할: CLI에서 동기화 저장(/api/save-sync)을 수동으로 트리거
// 실행: node scripts/triggerSaveSync.cjs

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'your-internal-secret'; // server.cjs에서 검증하는 시크릿

async function triggerSync() {
  console.log('🚀 동기화 저장 트리거 중...');

  try {
    const response = await axios.post(`${BASE_URL}/api/save-sync`, {
      triggeredBy: 'CLI_CONSISTENCY_CHECKER'
    }, {
      headers: { 
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET 
      },
      validateStatus: false
    });

    const data = response.data;

    if (response.status === 200 || response.status === 201) {
      console.log('✅ 동기화 저장 요청 성공:', data.message);
    } else {
      console.error('❌ 동기화 저장 요청 실패:', data.error || '알 수 없는 오류');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ API 연결 오류 (서버가 실행 중인지 확인하세요):', err.message);
    process.exit(1);
  }
}

triggerSync();
