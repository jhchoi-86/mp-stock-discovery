const crypto = require('crypto');
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
