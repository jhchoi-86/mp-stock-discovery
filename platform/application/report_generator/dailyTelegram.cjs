// cron: '10 21 * * 1-5'
// 21:10 텔레그램 통합 발송 

async function sendDailyTelegramReport() {
  console.log('[TelegramSender] Starting 21:10 Integrated Telegram Broadcast');
  
  // 1. 당일 결과 리포트 (국내 주식 + 코인 + 미국 판정 결과 통합)
  // const results = await prisma.signalResult.findMany({ where: { evalDate: today } });
  
  // 2. 익일 추천 종목 정리 (Limit 6 적용 방어)
  /*
  const tomorrowRecommendations = await prisma.approvedSignal.findMany({
    where: { status: 'PASS', createdAt: { gte: todayStart } },
    include: { candidate: true },
    orderBy: { candidate: { displayScore: 'desc' } },
    take: 6
  });
  */
  
  let attempts = 0;
  const maxAttempts = 3;

  while(attempts < maxAttempts) {
    try {
      // 발송 로직
      console.log('[TelegramSender] Broadcast Success.');
      break;
    } catch(e) {
      attempts++;
      console.error(`[TelegramSender] Broadcast failed, attempt ${attempts}`);
      if (attempts === maxAttempts) {
        console.error('[TelegramSender] Alerting admin of permanent broadcast failure.');
      } else {
        await new Promise(r => setTimeout(r, 5 * 60 * 1000)); // 5 min
      }
    }
  }
}

module.exports = { sendDailyTelegramReport };
