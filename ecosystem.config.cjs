module.exports = {
  apps: [
    {
      name: 'mp-stock-discovery',
      script: './server.cjs',
      instances: 'max',               // CPU 코어 수만큼 프로세스 다중화 생성
      exec_mode: 'cluster',           // 클러스터 모드 실행
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      wait_ready: true,               // process.send('ready') 이벤트를 기다림
      listen_timeout: 50000,          // 준비 신호를 기다리는 최대 대기 시간 (50초)
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
    {
      name: 'mp-stock-ai-api',
      script: './ai-service/venv/bin/python',
      args: '-m uvicorn main:app --host 127.0.0.1 --port 8000',
      cwd: './ai-service',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'mp-stock-ai-worker',
      script: 'ml_worker.py',
      cwd: './ai-service',
      interpreter: './ai-service/venv/bin/python',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
