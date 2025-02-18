require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const auth = require('./middleware/auth');
const betaRoutes = require('./routes/beta');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const animeRoutes = require('./routes/anime');
const fansubRoutes = require('./routes/fansub');
const donationRoutes = require('./routes/donation');
const postRoutes = require('./routes/post');
const mangaRoutes = require('./routes/manga');

const app = express();

// CORS ayarları
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://anitilky.vercel.app', 'https://www.anitilky.xyz']
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature'],
  credentials: true
}));

// Body parser ayarları - Stripe webhook için özel yapılandırma
app.use((req, res, next) => {
  if (req.originalUrl === '/api/donation/webhook') {
    next();
  } else {
    express.json({ 
      limit: '5gb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    })(req, res, next);
  }
});
app.use(express.urlencoded({ 
  limit: '5gb', 
  extended: true,
  parameterLimit: 50000000
}));
app.use(express.json({
  limit: '5gb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Statik dosyalar için
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// MongoDB bağlantısı
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000
}).then(() => {
  console.log('MongoDB bağlantısı başarılı');
}).catch((err) => {
  console.error('MongoDB bağlantı hatası:', err);
});

// Mongoose bağlantı havuzu ayarları
mongoose.connection.on('connected', () => {
  console.log('Mongoose bağlantı havuzu hazır');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose bağlantı hatası:', err);
});

// Model şemalarını kaydet
require('./models/User');
require('./models/Admin');
require('./models/BetaSignup');
require('./models/Anime');
require('./models/Fansub');
require('./models/Donation');
require('./models/Manga');

// Bakım modu middleware'ini ekle
app.use(adminRoutes.checkMaintenance);

// API rotaları
app.use('/api/beta-signup', betaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/anime', animeRoutes);
app.use('/api/fansub', fansubRoutes);
app.use('/api/donation', donationRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/manga', mangaRoutes);

// Sağlık kontrolü endpoint'i
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    message: 'Endpoint bulunamadı',
    path: req.path
  });
});

// Hata yakalama middleware
app.use((err, req, res, next) => {
  console.error('Hata:', err);
  
  // CORS hataları için özel yanıt
  if (err.name === 'CORSError') {
    return res.status(403).json({
      message: 'CORS hatası: İstek reddedildi',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // Stripe hataları için özel yanıt
  if (err.type === 'StripeSignatureVerificationError') {
    return res.status(400).json({
      message: 'Geçersiz Stripe imzası',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  res.status(500).json({ 
    message: 'Sunucu hatası',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Bir hata oluştu'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;