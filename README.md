# 🛒 Discord Shop — Production Ready

Website bán hàng tích hợp Discord OAuth2, MongoDB, Node.js + Express.

---

## ⚡ Chạy nhanh (Local)

```bash
npm install
cp .env.example .env   # Điền thông tin vào .env
npm run dev            # Development (nodemon)
```

---

## 🌐 Deploy lên Hosting

### ✅ Railway / Render / Heroku (Đơn giản nhất)

1. Push code lên GitHub (không commit `.env`)
2. Kết nối repo với Railway/Render
3. Thêm biến môi trường trong dashboard của họ
4. Đổi `DISCORD_CALLBACK_URL` thành URL thật:
   ```
   https://your-app.railway.app/auth/discord/callback
   ```
5. Thêm URL đó vào **Discord Developer Portal → OAuth2 → Redirects**

### ✅ VPS (Ubuntu/Debian) với PM2 + Nginx

```bash
# 1. Cài Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Cài PM2
npm install -g pm2

# 3. Upload code, tạo .env
cd /var/www/discord-shop
npm install --omit=dev

# 4. Chạy với PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup    # Tự start khi reboot

# 5. Nginx reverse proxy
sudo nano /etc/nginx/sites-available/discord-shop
```

Nội dung Nginx:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/discord-shop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

### ✅ MongoDB Atlas (Database trên cloud, miễn phí)

1. Tạo tài khoản tại https://cloud.mongodb.com
2. Tạo cluster (Free tier M0)
3. Database Access → Tạo user + password
4. Network Access → **Allow from Anywhere** (`0.0.0.0/0`)
5. Connect → Drivers → Copy URI:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/discord-shop?retryWrites=true&w=majority
   ```
6. Dán vào `MONGODB_URI` trong `.env`

---

## 🔑 Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `MONGODB_URI` | ✅ | URI kết nối MongoDB |
| `SESSION_SECRET` | ✅ | Chuỗi bí mật ngẫu nhiên ≥ 32 ký tự |
| `DISCORD_CLIENT_ID` | ✅ | Client ID từ Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | ✅ | Client Secret từ Discord Developer Portal |
| `DISCORD_CALLBACK_URL` | ✅ | URL callback OAuth2 |
| `ADMIN_IDS` | ✅ | Discord ID admin, cách nhau bằng dấu phẩy |
| `DISCORD_WEBHOOK_URL` | ❌ | Webhook để log đơn hàng |
| `NODE_ENV` | ❌ | `production` khi deploy |
| `PORT` | ❌ | Port server (mặc định 3000) |

> **Tạo SESSION_SECRET an toàn:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 🔗 Tạo Discord App

1. Vào https://discord.com/developers/applications → **New Application**
2. Tab **OAuth2** → Copy **Client ID** + **Client Secret**
3. **Redirects** → Thêm:
   - Local: `http://localhost:3000/auth/discord/callback`
   - Production: `https://yourdomain.com/auth/discord/callback`

---

## 📁 Cấu trúc

```
discord-shop/
├── server.js              # Entry — Express, Passport, MongoDB
├── ecosystem.config.js    # PM2 config cho VPS
├── Procfile               # Heroku/Railway
├── .env.example           # Template biến môi trường
├── models/                # Mongoose schemas
│   ├── User.js
│   ├── Product.js
│   ├── Order.js
│   └── Transaction.js
├── routes/
│   ├── auth.js            # /auth/login, /auth/discord/callback, /auth/logout
│   ├── shop.js            # /, /dashboard, /deposit, POST /buy/:id
│   └── admin.js           # /admin/**
├── middleware/auth.js     # isAuthenticated, isAdmin
├── views/                 # EJS templates
│   ├── partials/
│   ├── admin/
│   └── ...
├── public/
│   ├── css/style.css
│   └── js/main.js
└── logs/                  # PM2 logs (gitignored)
```
