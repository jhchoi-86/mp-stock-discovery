const axios = require('axios');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Sends a message to a specific Telegram Chat ID.
 * Wraps error handling so the main process never crashes from a Bot ban/throttle.
 * 
 * @param {string} chatId - Target User's Telegram Chat ID
 * @param {string} message - Content to send
 * @returns {boolean} - Success boolean
 */
const sendMessage = async (chatId, message) => {
  if (!BOT_TOKEN || !chatId) {
    console.error('[TelegramService] Missing BOT_TOKEN or ChatId. Cannot send message.');
    return false;
  }

  try {
    const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML' // Allow simple bolding/links in messages
    });
    
    if (response.data && response.data.ok) {
      console.log(`[TelegramService] Push sent to ID: ${chatId}`);
      return true;
    }
    return false;
  } catch (error) {
    if (error.response) {
      // User blocked the bot, ID invalid, or Telegram API Issue
      console.error(`[TelegramService] HTTP Error sending to ${chatId}: ${error.response.data.description || error.message}`);
    } else {
      console.error(`[TelegramService] Network Error sending to ${chatId}: ${error.message}`);
    }
    return false;
  }
};

module.exports = {
  sendMessage
};
