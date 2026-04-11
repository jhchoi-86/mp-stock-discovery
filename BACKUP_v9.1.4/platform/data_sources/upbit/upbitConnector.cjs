const WebSocket = require('ws');
// const logger = require('../../infra/logger/winston.cjs');

function connectUpbitWS(symbols, onMessage) {
  const ws = new WebSocket('wss://api.upbit.com/websocket/v1');
  
  ws.on('open', () => {
    console.log('[UpbitWS] Connected to Upbit WebSocket');
    ws.send(JSON.stringify([
      { ticket: 'mpstock' },
      { type: 'ticker', codes: symbols.map(s => `KRW-${s}`) }
    ]));
  });
  
  ws.on('message', (data) => {
    try {
      onMessage(JSON.parse(data));
    } catch(e) {
      console.error('[UpbitWS] Parse error');
    }
  });

  ws.on('close', () => {
    console.warn('[UpbitWS] Connection closed. Reconnecting in 3s...');
    setTimeout(() => connectUpbitWS(symbols, onMessage), 3000); // 30초 이내(3초) 자동 재연결
  });
  
  ws.on('error', (err) => {
    console.error('[UpbitWS] Error:', err.message);
  });
}

module.exports = { connectUpbitWS };
