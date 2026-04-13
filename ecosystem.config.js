module.exports = {
  apps: [{
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
  }]
};
