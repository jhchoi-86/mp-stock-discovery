module.exports = {
  apps: [
    {
      name: 'mp-stock-discovery',
      script: './server.cjs',
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
      script: 'uvicorn', // [TASK-E01] Use standard uvicorn command
      args: 'main:app --host 127.0.0.1 --port 8000 --workers 2', // [TASK-E01] Multi-worker support
      cwd: './ai-service',
      interpreter: './venv/Scripts/python.exe', // [TASK-E01] Explicit venv interpreter (Windows)
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      wait_ready: true, // [TASK-E05] Enable lifecycle sync
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Seoul' // [TASK-E03] Ensure consistent logging TZ
      }
    },
    {
      name: 'mp-stock-3m-sniper',
      script: './sniper_3m.cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      wait_ready: true, // [TASK-E05] Ensure sniper is ready before marking as online
      listen_timeout: 30000,
      kill_timeout: 30000, // [TASK-E06] Safe shutdown
      env_file: './.env', // [TASK-E02] PM2 6.x+ environment variable protection
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Seoul'
      }
    },
    {
      name: 'mp-stock-realtime-engine',
      script: './sniper_engine/realtime_engine.py',
      cwd: './',
      interpreter: './sniper_engine/venv/Scripts/python.exe',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M', // [TASK-E04] Increased for websocket buffer
      wait_ready: true, // [TASK-E05] Lifecycle sync
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: './.env',
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
