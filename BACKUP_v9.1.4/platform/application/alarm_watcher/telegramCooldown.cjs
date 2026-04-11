const redis = require('../../infra/redis/client.cjs');

const COOLDOWN_SEC = 4 * 60 * 60; // 4시간

// symbol: 종목코드, epNumber: 진입가 번호(1~3)
async function isOnCooldown(symbol, epNumber) {
  try {
    const key = `tg:cooldown:${symbol}:${epNumber}`;
    const val = await redis.get(key);
    return !!val;
  } catch (e) {
    return false;
  }
}

async function setCooldown(symbol, epNumber) {
  try {
    const key = `tg:cooldown:${symbol}:${epNumber}`;
    await redis.set(key, '1', 'EX', COOLDOWN_SEC);
  } catch (e) {
    console.error('[Cooldown] Redis Error:', e.message);
  }
}

module.exports = { isOnCooldown, setCooldown };
