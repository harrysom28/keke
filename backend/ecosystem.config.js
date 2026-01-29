// PM2 configuration for production deployment

module.exports = {
  apps: [
    {
      name: 'ride-hailing-api',
      script: './src/server.js',
      instances: 'max', // Use all available CPUs
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 8000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
    },
  ],
};
