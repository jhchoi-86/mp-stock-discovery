const Redis = require('ioredis');
const publisher = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const subscriber = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

async function publishSignalUpdate(payload) {
  try {
    await publisher.publish('signals:update', JSON.stringify(payload));
  } catch(e) {
    console.error('[PubSub] Publish Error:', e.message);
  }
}

function subscribeSignalUpdate(callback) {
  subscriber.subscribe('signals:update', (err, count) => {
    if (err) console.error('[PubSub] Subscribe Error:', err);
  });
  
  subscriber.on('message', (channel, message) => {
    if (channel === 'signals:update') {
      try {
        callback(JSON.parse(message));
      } catch(e) {
        console.error('[PubSub] Message Parse Error:', e);
      }
    }
  });
}

module.exports = { publishSignalUpdate, subscribeSignalUpdate };
