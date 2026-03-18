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
    }
  ]
};
