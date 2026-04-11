require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('[Telegram Bot] TELEGRAM_BOT_TOKEN is not defined in .env');
  process.exit(1);
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Telegram Echo Bot Listener started...');
console.log('Waiting for users to send messages to fetch their Chat IDs.\n');

// Listen for any kind of message and reply with their Chat ID
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  
  // Format the greeting response
  const replyMessage = `안녕하세요! 귀하의 텔레그램 ID는 [${chatId}] 입니다.\n이 숫자를 복사하여 MP 리서치 툴 마이 프로필 설정창에 등록해 주세요.`;

  // Send the reply back to the user
  bot.sendMessage(chatId, replyMessage)
    .then(() => {
      console.log(`[Telegram Bot] Provided ID ${chatId} to user @${msg.from.username || msg.from.first_name}`);
    })
    .catch((err) => {
      console.error(`[Telegram Bot] Error replying to ${chatId}:`, err.message);
    });
});

// Graceful Handling of Polling Errors
bot.on("polling_error", (error) => {
  console.error('[Telegram Bot Polling Error]:', error.code, error.message);
});
