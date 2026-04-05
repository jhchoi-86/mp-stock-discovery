function isMarketHoursMock(testTimeStr) {
    const now = new Date(testTimeStr);
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    const nowKST = new Date(now.getTime() + KST_OFFSET);
    const day = nowKST.getUTCDay();
    if (day === 0 || day === 6) return false;

    const h = nowKST.getUTCHours();
    const m = nowKST.getUTCMinutes();
    const t = h * 100 + m;

    if (t >= 830 && t <= 840) return true;
    if (t >= 900 && t <= 1800) return true;

    const isPostJune2026 = nowKST.getUTCFullYear() > 2026 || (nowKST.getUTCFullYear() === 2026 && nowKST.getUTCMonth() >= 5);
    if (isPostJune2026 && t > 1800 && t <= 2000) return true;

    return false;
}

const tests = [
    { time: '2026-04-02T23:25:00Z', expected: false, desc: '08:25 (Before Pre-market)' },
    { time: '2026-04-02T23:35:00Z', expected: true,  desc: '08:35 (Pre-market)' },
    { time: '2026-04-02T23:45:00Z', expected: false, desc: '08:45 (Gap)' },
    { time: '2026-04-03T00:05:00Z', expected: true,  desc: '09:05 (Market Open)' },
    { time: '2026-04-03T08:55:00Z', expected: true,  desc: '17:55 (Single Price)' },
    { time: '2026-04-03T09:05:00Z', expected: false, desc: '18:05 (Closed - April 2026)' },
    { time: '2026-06-03T09:05:00Z', expected: true,  desc: '18:05 (Extended - June 2026)' },
    { time: '2026-06-03T11:05:00Z', expected: false, desc: '20:05 (Cutoff - June 2026)' },
    { time: '2026-04-05T00:05:00Z', expected: false, desc: '09:05 (Sunday)' }
];

console.log('--- Schedule Validation v1.0 ---');
let pass = 0;
tests.forEach(test => {
    const result = isMarketHoursMock(test.time);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`${status} ${test.desc}: ${result}`);
    if (result === test.expected) pass++;
});

console.log(`\nResult: ${pass}/${tests.length} passed.`);
if (pass !== tests.length) process.exit(1);
