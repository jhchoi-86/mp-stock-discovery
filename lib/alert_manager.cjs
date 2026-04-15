'use strict';

// ──────────────────────────────────────────────────────────────────
// lib/alert_manager.cjs — Telegram 알림 발송 (suppress TTL 적용)
// 보안: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID → process.env 전용
// ──────────────────────────────────────────────────────────────────

require('dotenv').config();
const https = require('https');
const redis = require('../platform/infra/redis/client.cjs');

const SUPPRESS_TTL = {
  INFO:     3600,
  WARN:     3600,
  CRITICAL: 1800,
};

async function sendAlert(level, eventKey, message) {
  const suppressKey = `alert_suppress:${eventKey}`;

  try {
    const suppressed = await redis.get(suppressKey);
    if (suppressed) return;

    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn(`[AlertManager] TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 미설정 — 알림 스킵 (${eventKey})`);
      return;
    }

    const prefix = level === 'CRITICAL' ? '🚨' : level === 'WARN' ? '⚠️' : 'ℹ️';
    const text   = `${prefix} [${level}] ${message}`;

    const maskedToken = token.substring(0, 10) + '***';
    console.log(`[AlertManager] Telegram 발송 (token: ${maskedToken}, chat: ${chatId}, key: ${eventKey})`);

    const ids = String(chatId).split(',').map(s => s.trim()).filter(Boolean);
    await Promise.all(ids.map(id => postToTelegram(token, id, text)));

    const ttl = SUPPRESS_TTL[level] || 3600;
    await redis.set(suppressKey, '1', 'EX', ttl);

  } catch (err) {
    console.error(`[AlertManager] 알림 발송 실패 (${eventKey}):`, err.message);
    // 알림 실패는 파이프라인을 중단시키지 않음
  }
}

function postToTelegram(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const options = {
      hostname: 'api.telegram.org',
      path:     `/bot${token}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Telegram API ${res.statusCode}: ${data}`));
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Telegram 요청 타임아웃')); });
    req.write(body);
    req.end();
  });
}

module.exports = { sendAlert };
