module.exports = {
  apps: [{
    name: 'calendar360',
    script: './server/index.js',
    cwd: '/var/www/planora',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      DB_PATH: "/var/www/planora-data/calendar360.db",
      CONTROL_TOWER_PATH: "/var/www/planora-data/control_tower.db",
      TENANTS_DIR: "/var/www/planora-data/tenants",
      STORAGE_DIR: "/var/www/planora-data/storage",
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
