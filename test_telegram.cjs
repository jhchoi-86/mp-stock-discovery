require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(id => id);

// 만약 환경 변수가 제대로 설정되지 않았다면 에러 처리
if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
    console.error("❌ 오류: .env 파일 내부에 TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID 값이 설정되어 있지 않습니다!");
    process.exit(1);
}

async function runTest() {
    console.log("텔레그램 봇으로 테스트 메시지를 발송하는 중입니다...");

    const text = `🚨 [MP 매수 알림 연동 테스트]\n` +
                 `- 상태: 정상 연결 완료!\n` +
                 `- 이제 Webhook이 도착하면 이 방으로 실시간 알림이 울립니다.`;

    for (const chatId of TELEGRAM_CHAT_IDS) {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text })
            });
            
            const data = await response.json();
            if (response.ok && data.ok) {
                console.log(`✅ [${chatId}] 성공적으로 텔레그램 메시지가 발송되었습니다!`);
            } else {
                console.error(`❌ [${chatId}] 발송 실패. 텔레그램 서버 응답:`, data.description);
            }
        } catch (e) {
            console.error(`❌ [${chatId}] 알 수 없는 에러가 발생했습니다:`, e.message);
        }
    }
}

runTest();
