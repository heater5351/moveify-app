// PM2 ecosystem configuration for Moveify backend
// This enables auto-restart, crash recovery, and process monitoring

module.exports = {
  apps: [{
    name: 'moveify-backend',
    script: './server.js',

    // Watch for file changes in development (disable in production)
    watch: false,

    // Automatically restart if the app crashes
    autorestart: true,

    // Maximum number of restarts within min_uptime before the app is considered unstable
    max_restarts: 10,

    // Minimum uptime before considering the app as stable
    min_uptime: '10s',

    // Exponential backoff restart delay
    exp_backoff_restart_delay: 100,

    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },

    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,

    // Advanced options
    max_memory_restart: '500M', // Restart if memory usage exceeds 500MB

    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,

    // Error handling
    merge_logs: true,

    // Restart on file changes (useful for development)
    ignore_watch: ['node_modules', 'logs', 'database/moveify.db'],
  }]
};
