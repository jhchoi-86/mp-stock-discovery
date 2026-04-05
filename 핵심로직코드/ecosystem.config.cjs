module.exports = {
  apps: [
    {
      name: 'mp-stock-discovery',
      script: './server.cjs',
      instances: 1,                   // 단일 인스턴스 (SSE 로컬 환경 일치)
      exec_mode: 'fork',              // Fork 모드 실행 (Cluster 모드는 SSE 통신 불일치 유발)
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      wait_ready: true,               // process.send('ready') 이벤트를 기다림
      listen_timeout: 50000,          // 준비 신호를 기다리는 최대 대기 시간 (50초)
      kill_timeout: 10000,            // graceful shutdown 10초
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        CLIENT_URL: 'https://mpstock.co.kr'
      }
    },
/*
    {
      name: 'mp-stock-ai-api',
      script: process.platform === 'win32' ? './ai-service/venv/Scripts/python.exe' : './ai-service/venv/bin/python',
      args: '-m uvicorn main:app --host 127.0.0.1 --port 8000',
      cwd: './ai-service',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'mp-stock-ai-worker',
      script: 'ml_worker.py',
      cwd: './ai-service',
      interpreter: process.platform === 'win32' ? './ai-service/venv/Scripts/python.exe' : './ai-service/venv/bin/python',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'mp-stock-3m-sniper',
      script: './sniper_3m.cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production'
      }
    }
    */
  ]
};
