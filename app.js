const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

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

// Body parser ayarları
app.use((req, res, next) => {
  if (req.originalUrl === '/api/donation/webhook') {
    next();
  } else {
    express.json({ limit: '20mb' })(req, res, next);
  }
});
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));

// Route'ları içe aktar
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const animeRoutes = require('./routes/anime');
const fansubRoutes = require('./routes/fansub');
const donationRoutes = require('./routes/donation');
const postRoutes = require('./routes/post');
const mangaRoutes = require('./routes/manga');
const giftRoutes = require('./routes/giftRoutes');

// Auth middleware
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    // Test için geçici user objesi
    req.user = { id: 'test', username: 'test' };
  }
  next();
});

// Statik dosyalar için
app.use('/uploads', express.static('public/uploads'));

// MongoDB bağlantısı
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB bağlantısı başarılı');
}).catch((err) => {
  console.error('MongoDB bağlantı hatası:', err);
});

// Route'ları kullan - Donation route'unu öne aldık
app.use('/api/donation', donationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/anime', animeRoutes);
app.use('/api/fansub', fansubRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/manga', mangaRoutes);
app.use('/api/gift', giftRoutes);

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
  
  // Multer hataları için özel yanıt
  if (err.name === 'MulterError') {
    return res.status(400).json({
      message: 'Dosya yükleme hatası',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // Genel hatalar için yanıt
  res.status(500).json({ 
    message: 'Sunucu hatası',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
}); 