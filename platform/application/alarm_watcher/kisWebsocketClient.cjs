const redis = require('../../infra/redis/client.cjs');
const { isOnCooldown, setCooldown } = require('./telegramCooldown.cjs');

async function getCachedWatchlistTargets(symbol) {
  // Mock function representing DB/Redis query for active watchlists on this symbol
  return []; 
}

async function enqueueTelegramAlarm(target, ep, currentPrice) {
  // Push to BullMQ or local queue for async telegram delivery
  console.log(`[Alarm] Sending notification for ${target.symbol} at hit price ${ep.price}`);
}

async function onKisMessage(data) {
  const currentPrice = data.price;
  const symbol = data.symbol;

  const targets = await getCachedWatchlistTargets(symbol); 

  for (const target of targets) {
    for (const ep of target.approvedSignal.entryPrices) {
      if (currentPrice <= ep.price) {
        if (await isOnCooldown(symbol, ep.number)) continue;
        await setCooldown(symbol, ep.number);
        
        await enqueueTelegramAlarm(target, ep, currentPrice);
        /* 
        await prisma.alarmLog.create({ data: {
          userId: target.userId, symbol, entryPriceHit: ep.price, currentPrice
        }});
        */
      }
    }
  }
}

module.exports = { onKisMessage };
