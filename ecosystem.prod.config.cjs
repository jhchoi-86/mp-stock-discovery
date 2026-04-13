module.exports = {
  apps: [
    {
      name: 'mp-stock-discovery',
      script: './server.cjs',
      cwd: '/home/ubuntu/mp-stock-discovery',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1200M',
      wait_ready: true,
      listen_timeout: 50000,
      kill_timeout: 30000,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        CLIENT_URL: 'https://mpstock.co.kr',
        TZ: 'Asia/Seoul'
      }
    },
    {
      name: 'mp-stock-ai-api',
      script: './ai-service/venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8000 --workers 2',
      cwd: '/home/ubuntu/mp-stock-discovery',
      interpreter: './ai-service/venv/bin/python',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
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
      script: './sniper_3m.cjs',
      cwd: '/home/ubuntu/mp-stock-discovery',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '600M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: './.env',
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Seoul'
      }
    },
    {
      name: 'mp-stock-realtime-engine',
      script: './sniper_engine/realtime_engine.py',
      cwd: '/home/ubuntu/mp-stock-discovery',
      interpreter: './sniper_engine/venv/bin/python',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1200M',
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 30000,
      env_file: './.env',
      env_production: {
        PYTHONPATH: '.',
        TZ: 'Asia/Seoul'
      }
    }
  ]
};
