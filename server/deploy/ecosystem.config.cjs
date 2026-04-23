module.exports = {
  apps: [{
    name: 'calendar360',
    script: 'index.js',
    cwd: '/var/www/calendar360/server',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    error_file: '/var/log/calendar360/error.log',
    out_file: '/var/log/calendar360/out.log',
    merge_logs: true,
    time: true,
  }],
};
