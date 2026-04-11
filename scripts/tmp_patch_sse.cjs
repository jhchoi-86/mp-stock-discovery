const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.cjs');
let content = fs.readFileSync(serverPath, 'utf8');

const oldCode = `                    const refreshStats = async () => {
                        const reportCodes = getPriorityCodes();
                        // 오직 랜딩페이지 핵심 종목 6종목(추천 5 + 관심 1) 전용 실시간 웹소켓 대상 설정
                        const targets = [...reportCodes];
                        await updateSubscriptions(targets);
                    };`;

const newCode = `                    const refreshStats = async () => {
                        try {
                            const reportCodes = getPriorityCodes();
                            // [v7.9.5] DB Top 5 실시간 모니터링 강제 추가
                            const todayStr = new Date().toLocaleDateString("en-CA");
                            const dbTop5 = await prisma.dailyTop5.findMany({ where: { date: todayStr } });
                            const dbCodes = dbTop5.map(s => s.stock_code);
                            
                            const targets = Array.from(new Set([...reportCodes, ...dbCodes]));
                            console.log("[WSS-SYNC] Updating real-time subscription for", targets.length, "stocks (Report + Top5)");
                            await updateSubscriptions(targets);
                        } catch (e) {
                            console.error("[WSS-SYNC] Error in refreshStats:", e.message);
                        }
                    };`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(serverPath, content);
    console.log('Successfully patched server.cjs');
} else {
    console.error('Could not find oldCode in server.cjs');
    // Try a more flexible match if needed
}
