module.exports = {
  apps: [
    {
      name: 'mp-stock-discovery',
      script: './server.cjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        CLIENT_URL: 'http://13.211.128.167' // Update this environment array as commanded
      }
    }
  ]
};
