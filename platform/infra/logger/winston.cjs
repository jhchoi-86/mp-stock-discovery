const winston = require('winston');
// const prisma = require('../db/prismaClient.cjs');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
  ]
});

// error 레벨: DB 저장 + 운영자 텔레그램 즉시 발송
logger.on('error:logged', async (info) => {
  console.log('[WinstonLogger] Captured Error:', info.message);
  try {
    // await prisma.errorLog.create({ data: { level: 'error', message: info.message } });
    // await sendAdminTelegram(`🚨 에러: ${info.message}`);
    console.log('[WinstonLogger] Successfully logged to DB & Telegram alerted.');
  } catch (e) {
    console.error('Failed to save log to DB', e);
  }
});

// Override error method to emit event
const originalError = logger.error.bind(logger);
logger.error = (message, meta) => {
  originalError(message, meta);
  logger.emit('error:logged', { message, meta });
};

module.exports = logger;
