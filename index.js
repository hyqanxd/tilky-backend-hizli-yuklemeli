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
const giftRoutes = require('./routes/giftRoutes');

const app = express();

// Memory optimization
const v8 = require('v8');
const totalHeapSize = v8.getHeapStatistics().total_available_size;
const totalHeapSizeInGB = (totalHeapSize / 1024 / 1024 / 1024).toFixed(2);
console.log(`Total heap size (GB) = ${totalHeapSizeInGB}`);

// V8 heap size limitleri
v8.setFlagsFromString('--max-old-space-size=4096'); // 4GB limit

// Memory monitoring
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
  const external = (memUsage.external / 1024 / 1024).toFixed(2);
  
  console.log(`Memory Usage - Heap Used: ${heapUsed}MB, Heap Total: ${heapTotal}MB, External: ${external}MB`);
  
  // Memory limit kontrolü
  if (memUsage.heapUsed > 3 * 1024 * 1024 * 1024) { // 3GB
    console.log('Memory limit aşıldı, garbage collection tetikleniyor...');
    if (global.gc) {
      global.gc();
    }
  }
}, 60000); // Her 1 dakikada bir

// Garbage collection için interval
setInterval(() => {
  try {
    if (global.gc) {
      global.gc();
      console.log('Garbage collection completed');
    }
  } catch (e) {
    console.log('Garbage collection failed:', e);
  }
}, 60000); // Her 1 dakikada bir

// Timeout ayarları
app.use((req, res, next) => {
  // 10 dakika timeout
  req.setTimeout(600000);
  res.setTimeout(600000);
  next();
});

// Body parser limitleri
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
  if (req.originalUrl === '/api/donation/webhook' || req.originalUrl === '/api/gift/webhook') {
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
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTimeMS: 30000,
  retryWrites: true,
  w: 'majority'
}).then(() => {
  console.log('MongoDB bağlantısı başarılı');
}).catch((err) => {
  console.error('MongoDB bağlantı hatası:', err);
  process.exit(1);
});

// Mongoose bağlantı havuzu ayarları
mongoose.connection.on('connected', () => {
  console.log('Mongoose bağlantı havuzu hazır');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose bağlantı hatası:', err);
  if (err.code === 'ECONNRESET') {
    console.log('Bağlantı yeniden kurulmaya çalışılıyor...');
    setTimeout(() => {
      mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000
      });
    }, 5000);
  }
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB bağlantısı kesildi');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB bağlantısı kapatıldı');
    process.exit(0);
  } catch (err) {
    console.error('Shutdown hatası:', err);
    process.exit(1);
  }
});

// Model şemalarını kaydet
require('./models/User');
require('./models/Admin');
require('./models/BetaSignup');
require('./models/Anime');
require('./models/Fansub');
require('./models/Donation');
require('./models/Manga');
require('./models/GiftRole');
require('./models/GiftHistory');
require('./models/Gift');

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
app.use('/api/gift', giftRoutes);

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
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

// Server timeout ayarları
server.timeout = 300000; // 5 dakika
server.keepAliveTimeout = 65000; // 65 saniye
server.headersTimeout = 66000; // 66 saniye

// Server error handling
server.on('error', (err) => {
  console.error('Server error:', err);
  if (err.code === 'ECONNRESET') {
    console.log('Connection reset error, server restarting...');
    server.close(() => {
      process.exit(1);
    });
  }
});

// Uncaught exception handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (err.code === 'ECONNRESET') {
    console.log('ECONNRESET hatası yakalandı, server kapatılıyor...');
    server.close(() => {
      process.exit(1);
    });
  } else {
    console.log('Beklenmeyen hata, server kapatılıyor...');
    server.close(() => {
      process.exit(1);
    });
  }
});

// Unhandled rejection handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;