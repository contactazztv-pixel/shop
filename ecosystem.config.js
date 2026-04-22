// PM2 config — dùng cho VPS/Hosting
// Cài PM2: npm install -g pm2
// Chạy:    pm2 start ecosystem.config.js --env production
// Xem log: pm2 logs discord-shop
// Reload:  pm2 reload discord-shop

module.exports = {
  apps: [{
    name:         'discord-shop',
    script:       'server.js',
    instances:    1,            // tăng lên 'max' nếu muốn cluster
    exec_mode:    'fork',
    watch:        false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'development',
      PORT:     3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT:     3000,
    },
    error_file:  './logs/error.log',
    out_file:    './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs:  true,
  }],
};
