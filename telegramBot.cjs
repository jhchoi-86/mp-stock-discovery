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

  for (const id of targets) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
      await axios.post(url, {
        chat_id: id.trim(),
        text: message
      });
      console.log(`[Telegram] Alert sent to ${id}`);
    } catch (e) {
      console.error(`[Telegram] Failed to send to ${id}:`, e.response ? e.response.data : e.message);
    }
  }
}

module.exports = { sendTelegramMessage };
