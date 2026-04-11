const assert = require('assert');

const toKSTMidnight = (dateStr, endOfDay = false) => {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    if (endOfDay) d.setTime(d.getTime() + 86399999);
    return d;
};

function runTest() {
    console.log("--- Starting KST Midnight Helper Verification ---");

    const dateStr = "2026-04-11";
    
    // 1. Start of Day Test
    const start = toKSTMidnight(dateStr);
    const startUTC = start.toISOString();
    console.log(`[Test] ${dateStr} Start of Day (UTC): ${startUTC}`);
    // KST 2026-04-11 00:00:00 is UTC 2026-04-10 15:00:00
    assert.strictEqual(startUTC, "2026-04-10T15:00:00.000Z", "Start of day UTC mismatch!");

    // 2. End of Day Test
    const end = toKSTMidnight(dateStr, true);
    const endUTC = end.toISOString();
    console.log(`[Test] ${dateStr} End of Day (UTC): ${endUTC}`);
    // KST 2026-04-11 23:59:59.999 is UTC 2026-04-11 14:59:59.999
    assert.strictEqual(endUTC, "2026-04-11T14:59:59.999Z", "End of day UTC mismatch!");

    // 3. Current Time Test (sanity check)
    const nowKSTDate = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const todayStart = toKSTMidnight(nowKSTDate);
    console.log(`[Test] Today (${nowKSTDate}) Start of Day (UTC): ${todayStart.toISOString()}`);

    console.log("--- Verification SUCCESS: toKSTMidnight generates correct UTC timestamps. ---");
}

try {
    runTest();
} catch (e) {
    console.error("Verification FAILED:", e.message);
    process.exit(1);
}
