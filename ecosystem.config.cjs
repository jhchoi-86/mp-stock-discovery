module.exports = {
  apps: [
    {
      name: 'mp-stock-discovery',
      script: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/server.cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      wait_ready: true,
      listen_timeout: 50000,
      kill_timeout: 30000, // [TASK-E06] Increased to 30s for safe sync
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        TZ: 'Asia/Seoul'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        CLIENT_URL: 'https://mpstock.co.kr',
        TZ: 'Asia/Seoul'
      }
    },
    {
      name: 'mp-stock-ai-api',
      script: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/ai-service/venv/Scripts/uvicorn.exe',
      args: 'main:app --host 127.0.0.1 --port 8000 --workers 2',
      cwd: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/ai-service',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Seoul'
      }
    },
    {
      name: 'mp-stock-3m-sniper',
      script: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/sniper_3m.cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/.env',
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Seoul'
      }
    },
    {
      name: 'mp-stock-realtime-engine',
      script: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/sniper_engine/realtime_engine.py',
      cwd: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴',
      interpreter: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/sniper_engine/venv/Scripts/python.exe',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: 'C:/Users/danbe/Documents/Antigravity/주식종목발굴/.env',
      env: {
        PYTHONPATH: '.',
        TZ: 'Asia/Seoul'
      },
      env_production: {
        PYTHONPATH: '.',
        TZ: 'Asia/Seoul'
      }
    }
  ]
};
