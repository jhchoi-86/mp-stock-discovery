'use strict';

// ──────────────────────────────────────────────────────────────────
// lib/token_manager.cjs — KIS OAuth2 토큰 관리
// Redis mutex 기반 race-condition 방지
// ──────────────────────────────────────────────────────────────────

require('dotenv').config();
const axios = require('axios');
const redis = require('../platform/infra/redis/client.cjs');

const REDIS_KEY_TOKEN = 'kis_token';
const REDIS_KEY_LOCK  = 'kis_token_lock';
const LOCK_TTL        = 30;
const TOKEN_BUFFER    = 600;
const POLL_INTERVAL   = 500;
const POLL_MAX        = 30;

async function getToken() {
  const cached = await redis.get(REDIS_KEY_TOKEN);
  if (cached) return cached;
  return refreshToken();
}

async function refreshToken() {
  const lockAcquired = await redis.set(REDIS_KEY_LOCK, '1', 'EX', LOCK_TTL, 'NX');

  if (!lockAcquired) {
    return waitForToken();
  }

  try {
    const res = await axios.post(
      'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
      {
        grant_type: 'client_credentials',
        appkey:     process.env.KIS_APP_KEY,
        appsecret:  process.env.KIS_APP_SECRET,
      },
      { timeout: 10000 }
    );

    const { access_token, expires_in } = res.data;
    if (!access_token) throw new Error('KIS 토큰 응답에 access_token 없음');

    const ttl = Math.max((parseInt(expires_in) || 86400) - TOKEN_BUFFER, 300);
    await redis.set(REDIS_KEY_TOKEN, access_token, 'EX', ttl);

    return access_token;

  } catch (err) {
    console.error('[TokenManager] KIS 토큰 갱신 실패:', err.message);
    throw err;
  } finally {
    await redis.del(REDIS_KEY_LOCK);
  }
}

async function waitForToken() {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_INTERVAL);
    const token = await redis.get(REDIS_KEY_TOKEN);
    if (token) return token;
  }

  console.warn('[TokenManager] 토큰 대기 초과 — lock 강제 해제 후 재시도');
  await redis.del(REDIS_KEY_LOCK);
  return refreshToken();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getToken, refreshToken, waitForToken };
