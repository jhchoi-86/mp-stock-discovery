// Docker 컨테이너 전용 PM2 설정
const BASE = '.';
const pyInterpreter = 'python';
const uvicornScript = 'uvicorn';

module.exports = {
  apps: [
    {
      name: 'server',
      script: `${BASE}/server.cjs`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      wait_ready: true,
      listen_timeout: 50000,
      kill_timeout: 30000,
      env_production: { NODE_ENV: 'production', PORT: 3001, CLIENT_URL: 'https://mpstock.co.kr', TZ: 'Asia/Seoul' }
    },
    {
      name: 'mp-stock-ai-api',
      script: pyInterpreter,
      interpreter: 'none',
      args: `-m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2`,
      cwd: `${BASE}/ai-service`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '600M',
      env_production: { NODE_ENV: 'production', TZ: 'Asia/Seoul' }
    },
    {
      name: 'mp-stock-3m-sniper',
      script: `${BASE}/sniper_3m.cjs`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '600M',
      env_production: { NODE_ENV: 'production', TZ: 'Asia/Seoul' }
    },
    {
      name: 'mp-stock-realtime-engine',
      script: pyInterpreter,
      interpreter: 'none',
      args: `${BASE}/sniper_engine/realtime_engine.py`,
      cwd: `${BASE}`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1200M',
      env_production: { PYTHONPATH: '.', TZ: 'Asia/Seoul' }
    },
    {
      name: 'sync-scheduler',
      script: `${BASE}/sync_scheduler.cjs`,
      cwd: `${BASE}`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env_production: { NODE_ENV: 'production', TZ: 'Asia/Seoul' }
    },
    {
      name: 'ppp-scheduler',
      script: `${BASE}/ppp_scheduler.cjs`,
      cwd: `${BASE}`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env_production: { NODE_ENV: 'production', TZ: 'Asia/Seoul' }
    }
  ]
};