const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Force IPv4 to prevent Node.js on EC2 hanging on unreachable IPv6 routes
const httpsAgent = new https.Agent({ family: 4 });

/**
 * Sends a message to a specific Telegram Chat ID.
 * Wraps error handling so the main process never crashes from a Bot ban/throttle.
 * 
 * @param {string} chatId - Target User's Telegram Chat ID
 * @param {string} message - Content to send
 * @returns {boolean} - Success boolean
 */
const sendMessage = async (chatId, message) => {
  // Dynamically load and explicitly trim to fix Windows (\r) line ending issues
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  
  if (!token || !chatId) {
    console.error('[TelegramService] Missing TELEGRAM_BOT_TOKEN or ChatId. Cannot send message.');
    return false;
  }

  const TELEGRAM_API_URL = `https://api.telegram.org/bot${token}`;

  try {
    const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: message
    }, {
      httpsAgent,
      timeout: 10000 // Resilience: Prevents hangs if Telegram API is unresponsive
    });
    
    if (response.data && response.data.ok) {
      console.log(`[TelegramService] Push sent to ID: ${chatId}`);
      return true;
    }
    return false;
  } catch (error) {
    if (error.response) {
      // User blocked the bot, ID invalid, or Telegram API Issue
      console.error(`[TelegramService] HTTP Error sending to ${chatId}: ${error.response.data?.description || error.message}`);
    } else {
      // Log the full error to safely catch hidden axios/network bugs
      console.error(`[TelegramService] Network Error sending to ${chatId}:`, error.message || error);
    }
    return false;
  }
};

module.exports = {
  sendMessage
};
