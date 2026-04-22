'use strict';
require('dotenv').config();

const express         = require('express');
const session         = require('express-session');
const MongoStore      = require('connect-mongo');
const passport        = require('passport');
const mongoose        = require('mongoose');
const DiscordStrategy = require('passport-discord').Strategy;
const path            = require('path');
const helmet          = require('helmet');
const morgan          = require('morgan');
const compression     = require('compression');

const User = require('./models/User');

// ─── Validate env ─────────────────────────────────────────
const REQUIRED = ['MONGODB_URI','SESSION_SECRET','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_CALLBACK_URL'];
for (const key of REQUIRED) {
  if (!process.env[key]) { console.error(`❌ Thiếu biến môi trường: ${key}`); process.exit(1); }
}

const IS_PROD   = process.env.NODE_ENV === 'production';
const PORT      = parseInt(process.env.PORT) || 3000;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// ─── App ──────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // BẮT BUỘC khi deploy sau Nginx/Heroku/Railway/Render

// ─── Security & Perf ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'","'unsafe-inline'",'cdn.tailwindcss.com','cdnjs.cloudflare.com'],
      styleSrc:   ["'self'","'unsafe-inline'",'fonts.googleapis.com','cdn.tailwindcss.com'],
      fontSrc:    ["'self'",'fonts.gstatic.com'],
      imgSrc:     ["'self'",'data:','cdn.discordapp.com','api.qrserver.com','img.vietqr.io'],
      connectSrc: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
if (!IS_PROD) app.use(morgan('dev'));

// ─── Views & Static ───────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '7d' : '0', etag: true,
}));

// ─── Body parsers ─────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── MongoDB ──────────────────────────────────────────────
mongoose.set('strictQuery', true);
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB:', err.message);
    setTimeout(connectDB, 5000);
  }
}
connectDB();
mongoose.connection.on('disconnected', () => { console.warn('⚠️  MongoDB disconnected'); setTimeout(connectDB, 3000); });
mongoose.connection.on('error', err => console.error('MongoDB error:', err.message));

// ─── Session ──────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600,
    crypto: { secret: process.env.SESSION_SECRET },
  }),
  cookie: {
    secure:   IS_PROD,
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  },
  name: 'dshop.sid',
}));

// ─── Passport ─────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy(
  {
    clientID:     process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL:  process.env.DISCORD_CALLBACK_URL,
    scope:        ['identify', 'email'],
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const isAdmin = ADMIN_IDS.includes(profile.id);
      let user = await User.findOne({ discordId: profile.id });
      if (user) {
        user.username = profile.username;
        user.discriminator = profile.discriminator || '0';
        user.avatar = profile.avatar || null;
        user.email = profile.email || user.email;
        user.lastLogin = new Date();
        if (isAdmin && !user.isAdmin) user.isAdmin = true;
        await user.save();
      } else {
        user = await User.create({
          discordId: profile.id, username: profile.username,
          discriminator: profile.discriminator || '0',
          avatar: profile.avatar || null, email: profile.email || null, isAdmin,
        });
      }
      return done(null, user);
    } catch (err) { return done(err, null); }
  }
));

passport.serializeUser((user, done) => done(null, user._id.toString()));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).lean();
    if (!user) return done(null, false);
    user.avatarURL = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || 0) % 5}.png`;
    done(null, user);
  } catch (err) { done(err, null); }
});

// ─── Global locals ─────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.user    = req.user || null;
  res.locals.IS_PROD = IS_PROD;
  next();
});

// ─── Routes ───────────────────────────────────────────────
app.use('/auth',  require('./routes/auth'));
app.use('/',      require('./routes/shop'));
app.use('/admin', require('./routes/admin'));

// ─── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { user: req.user || null, code: 404, message: 'Trang không tồn tại.' });
});

// ─── Error handler ────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Error]', err.stack || err.message);
  if (res.headersSent) return next(err);
  res.status(500).render('error', {
    user: req.user || null, code: 500,
    message: IS_PROD ? 'Lỗi máy chủ nội bộ.' : err.message,
  });
});

// ─── Start ────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 http://0.0.0.0:${PORT} [${IS_PROD ? 'production' : 'development'}]`);
  console.log(`👑 Admins: ${ADMIN_IDS.join(', ') || '(chưa cấu hình)'}`);
});

process.on('SIGTERM', () => server.close(() => mongoose.connection.close(false, () => process.exit(0))));
process.on('SIGINT',  () => server.close(() => mongoose.connection.close(false, () => process.exit(0))));
process.on('uncaughtException',  err => console.error('Uncaught:', err));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
