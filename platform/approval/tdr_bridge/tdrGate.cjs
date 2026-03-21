const crypto = require('crypto');
const axios = require('axios');
// const prisma = require('../../infra/db/prismaClient.cjs'); // Uncomment when DB is ready

async function verifyAndApprove(candidate) {
  const expectedHash = crypto.createHmac('sha256', process.env.TDR_SECRET || 'secret')
                             .update(JSON.stringify(candidate.raw_data || {}))
                             .digest('hex');
  
  if (candidate.sourceHash !== expectedHash) {
    console.error('[TDRGate] Fail-Closed: 변조 감지', candidate.id);
    // await prisma.rejectionLog.create({ data: { candidateId: candidate.id, reason: 'HASH_MISMATCH' } });
    return null;
  }

  // T5-04 Anomaly Detection (500ms 컷 Fail-Open)
  try {
    const symbol = candidate.code || (candidate.raw_data && candidate.raw_data.symbol) || 'Unknown';
    const anomalyRes = await axios.get(`http://127.0.0.1:8000/api/v1/anomaly-check?symbol=${symbol}`, { timeout: 500 });
    
    if (anomalyRes.data && anomalyRes.data.is_anomaly === true) {
      console.error('[TDRGate] Fail-Closed: AI 실시간 이상치(Anomaly) 탐지됨. 승인 거부.', candidate.id || symbol);
      // await prisma.rejectionLog.create({ data: { candidateId: candidate.id, reason: 'AI_ANOMALY_DETECTED' } });
      return null;
    }
  } catch (err) {
    if (err.code === 'ECONNABORTED' || (err.message && err.message.includes('timeout'))) {
      console.warn('[TDRGate] Fail-Open: Anomaly API 타임아웃(500ms 초과). 이상치 검증 패스.');
    } else {
      console.warn('[TDRGate] Fail-Open: Anomaly API 접속/응답 에러:', err.message);
    }
  }

  // 승인 성공 처리 
  /*
  return await prisma.approvedSignal.create({
    data: {
      candidateId: candidate.id,
      execHash: expectedHash,
      sourceHash: candidate.sourceHash,
      status: 'PASS'
    }
  });
  */
  return { id: 999, candidateId: candidate.id, status: 'PASS' }; // Mock return
}

module.exports = { verifyAndApprove };
