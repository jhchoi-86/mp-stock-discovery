const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.cjs');
let content = fs.readFileSync(serverPath, 'utf8');

// Flexible replacement using Regex to handle CRLF and comments
const regex = /const refreshStats = async \(\) => \{[\s\S]*?const reportCodes = getPriorityCodes\(\);[\s\S]*?const targets = \[\.\.\.reportCodes\];[\s\S]*?await updateSubscriptions\(targets\);[\s\S]*?\};/;

const newCode = `const refreshStats = async () => {
                        try {
                            const reportCodes = getPriorityCodes();
                            // [v7.9.5] DB Top 5 실시간 모니터링 강제 추가
                            const kst = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
                            const todayStr = kst.toISOString().split('T')[0];
                            const dbTop5 = await prisma.dailyTop5.findMany({ where: { date: todayStr } });
                            const dbCodes = dbTop5.map(s => s.stock_code);
                            
                            const targets = Array.from(new Set([...reportCodes, ...dbCodes]));
                            console.log("[WSS-SYNC] Updating real-time subscription for", targets.length, "stocks (Report + Top5)");
                            await updateSubscriptions(targets);
                        } catch (e) {
                            console.error("[WSS-SYNC] Error in refreshStats:", e.message);
                        }
                    };`;

if (regex.test(content)) {
    content = content.replace(regex, newCode);
    fs.writeFileSync(serverPath, content);
    console.log('Successfully patched server.cjs with Regex');
} else {
    console.error('Could not match refreshStats pattern in server.cjs');
}
