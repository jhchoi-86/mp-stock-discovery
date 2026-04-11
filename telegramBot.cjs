const axios = require('axios');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_IDS = process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID.split(',') : ['8577292579'];

async function sendTelegramMessage(message, chatId = null) {
  if (!BOT_TOKEN) {
    console.error('[Telegram] No BOT_TOKEN found in .env');
    return;
  }

  const targets = chatId ? [chatId] : DEFAULT_CHAT_IDS;
  
  // [TASK-S06] Telegram message splitting (Max 4096 chars)
  const MAX_LEN = 4000;
  const chunks = [];
  if (message.length > MAX_LEN) {
    let cur = "";
    const lines = message.split('\n');
    for (const line of lines) {
      if ((cur + line).length > MAX_LEN) {
        chunks.push(cur);
        cur = line + '\n';
      } else {
        cur += line + '\n';
      }
    }
    if (cur) chunks.push(cur);
  } else {
    chunks.push(message);
  }

  for (const id of targets) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    for (const chunk of chunks) {
      try {
        await axios.post(url, {
          chat_id: id.trim(),
          text: chunk
        });
        console.log(`[Telegram] Chunk sent to ${id}`);
        if (chunks.length > 1) await new Promise(r => setTimeout(r, 500)); // Anti-flood
      } catch (e) {
        console.error(`[Telegram] Failed to send to ${id}:`, e.response ? e.response.data : e.message);
      }
    }
  }
}

module.exports = { sendTelegramMessage };
