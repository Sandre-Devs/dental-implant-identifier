module.exports = {
  apps: [
    {
      name: 'dii-backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/error.log',
      out_file:   './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'dii-worker',
      script: 'worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-error.log',
      out_file:   './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ],

  // SQLite Web — painel visual do banco (opcional)
  // Ative com: bash scripts/setup-sqlite-web.sh
  // Ou adicione manualmente ao array apps acima se quiser que o PM2 gerencie
}
