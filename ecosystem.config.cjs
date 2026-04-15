// [v9.4.19] EC2 Linux / Windows 크로스플랫폼 PM2 설정
const isWindows = process.platform === 'win32';
const BASE      = isWindows
    ? 'C:/Users/danbe/Documents/Antigravity/주식종목발굴'
    : '/home/ubuntu/mp-stock-discovery';

const pyInterpreter = isWindows
    ? `${BASE}/sniper_engine/venv/Scripts/python.exe`
    : `${BASE}/sniper_engine/venv/bin/python`;

const uvicornScript = isWindows
    ? `${BASE}/ai-service/venv/Scripts/uvicorn.exe`
    : `${BASE}/ai-service/venv/bin/uvicorn`;

const aiInterpreter = isWindows ? 'none' : `${BASE}/ai-service/venv/bin/python`;
const aiArgs        = isWindows
    ? 'main:app --host 127.0.0.1 --port 8000 --workers 2'
    : '-m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2';

module.exports = {
  apps: [
    {
      name: 'mp-stock-discovery',
      script: `${BASE}/server.cjs`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      wait_ready: true,
      listen_timeout: 50000,
      kill_timeout: 30000,
      env: { NODE_ENV: 'development', PORT: 3001, TZ: 'Asia/Seoul' },
      env_production: { NODE_ENV: 'production', PORT: 3001, CLIENT_URL: 'https://mpstock.co.kr', TZ: 'Asia/Seoul' }
    },
    {
      name: 'mp-stock-ai-api',
      script: `${BASE}/ai-service/venv/bin/python`,
      args: '-m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2',
      cwd: `${BASE}/ai-service`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: `${BASE}/.env`,
      env_production: { NODE_ENV: 'production', TZ: 'Asia/Seoul' }
    },
    {
      name: 'mp-stock-3m-sniper',
      script: `${BASE}/sniper_3m.cjs`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: `${BASE}/.env`,
      env_production: { NODE_ENV: 'production', TZ: 'Asia/Seoul' }
    },
    {
      name: 'mp-stock-realtime-engine',
      script: `${BASE}/sniper_engine/venv/bin/python`,
      args: `${BASE}/sniper_engine/realtime_engine.py`,
      cwd: `${BASE}`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: `${BASE}/.env`,
      env: { PYTHONPATH: '.', TZ: 'Asia/Seoul' },
      env_production: { PYTHONPATH: '.', TZ: 'Asia/Seoul' }
    }
  ]
};
