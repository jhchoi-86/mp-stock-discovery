const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.cjs');
let content = fs.readFileSync(serverPath, 'utf8');

// 1. Add KST utility import
if (!content.includes('src/utils/kst.cjs')) {
    content = content.replace(
        "process.env.TZ = 'Asia/Seoul';",
        "process.env.TZ = 'Asia/Seoul';\nconst { getKstNow, getKstDateString, isMarketHours } = require('./src/utils/kst.cjs');"
    );
}

// 2. Normalize isKSTTradingHours
content = content.replace(
    /function isKSTTradingHours\(\) \{[\s\S]*?return timeVal >= 900 && timeVal <= 1540; \/\/ 09:00~15:40\r?\n\}/,
    "function isKSTTradingHours() {\n    return isMarketHours();\n}"
);

// 3. Standardize date logic in getTop5ForPoller
content = content.replace(
    /const now = new Date\(\);[\s\S]*?const today = kst\.toISOString\(\)\.split\('T'\)\[0\];/,
    "const today = getKstDateString();"
);

// 4. Inject Auto-Sync into poller
const autoSyncInject = `
                updateTimeSlotSignals(top5);
                
                // [v9.2.1] Auto-Strategy Update (Ensures Landing Page Refresh)
                try {
                    console.log('[SignalPoller] Triggering Landing Page Auto-Sync...');
                    const snapshots = await prisma.dailyStockSnapshot.findMany({
                        where: { code: { in: top5 } },
                        orderBy: { createdAt: 'desc' },
                        take: 10
                    });
                    const latestSnaps = [];
                    const seen = new Set();
                    for (const s of snapshots) {
                        if (!seen.has(s.code)) { seen.add(s.code); latestSnaps.push(s); }
                    }
                    if (latestSnaps.length > 0) {
                        await publishingService.publishToAll(latestSnaps);
                        console.log('[SignalPoller] AUTO-SYNC SUCCESS.');
                    }
                } catch (autoErr) {
                    console.error('[SignalPoller] AUTO-SYNC FAILED:', autoErr.message);
                }
`;

if (!content.includes('Auto-Strategy Update')) {
    content = content.replace(
        "updateTimeSlotSignals(top5);",
        autoSyncInject
    );
}

// 5. Standardize other KST usages
content = content.replace(
    /const today = new Date\(Date\.now\(\) \+ \(9 \* 60 \* 60 \* 1000\)\)\.toISOString\(\)\.split\('T'\)\[0\];/g,
    "const today = getKstDateString();"
);
content = content.replace(
    /const now = new Date\(Date\.now\(\) \+ \(9 \* 60 \* 60 \* 1000\)\);/g,
    "const now = getKstNow();"
);

fs.writeFileSync(serverPath, content, 'utf8');
console.log('server.cjs patched successfully.');
