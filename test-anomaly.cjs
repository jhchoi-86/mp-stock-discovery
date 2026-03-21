const { verifyAndApprove } = require('./platform/approval/tdr_bridge/tdrGate.cjs');
const crypto = require('crypto');

function createMockCandidate(code) {
  const raw_data = { symbol: code, test: true };
  const expectedHash = crypto.createHmac('sha256', process.env.TDR_SECRET || 'secret')
                             .update(JSON.stringify(raw_data))
                             .digest('hex');
  return { id: 100, code: code, raw_data, sourceHash: expectedHash };
}

async function runTests() {
  console.log("\n--- [Test 1] Normal Fast Response (<= 50ms) ---");
  const cand1 = createMockCandidate("005930");
  const res1 = await verifyAndApprove(cand1);
  console.log("[Test 1 Result]:", res1 ? "PASS" : "FAIL (Expected PASS)");

  console.log("\n--- [Test 2] Timeout Simulation (API takes 1.0s, axios cutoff 500ms) ---");
  const cand2 = createMockCandidate("TIMEOUT_TEST");
  const res2 = await verifyAndApprove(cand2);
  console.log("[Test 2 Result]:", res2 ? "PASS (Fail-Open Success)" : "FAIL (Expected PASS due to Fail-Open)");

  console.log("\n--- [Test 3] Anomaly Detected (Z-Score > 3.0) ---");
  const cand3 = createMockCandidate("ANOMALY_TEST");
  const res3 = await verifyAndApprove(cand3);
  console.log("[Test 3 Result]:", res3 === null ? "REJECTED (Fail-Closed Success)" : "FAIL (Expected REJECTED)");
}

runTests();
