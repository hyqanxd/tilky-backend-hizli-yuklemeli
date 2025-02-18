const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const BetaSignup = require('../models/BetaSignup');
const Anime = require('../models/Anime');
const Fansub = require('../models/Fansub');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const drive = require('../config/googleDrive');
const { Readable } = require('stream');
const { uploadToBunnyStorage, deleteFromBunnyStorage } = require('../utils/bunnyStorage');

// E-posta gönderme yapılandırması
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Bakım modu için global değişkenler
let maintenanceRoutes = [];
let maintenanceMessage = 'Bakım modu aktif. Daha sonra tekrar deneyin.';

// Bakım durumunu kontrol et
router.get('/maintenance', async (req, res) => {
  try {
    res.json({
      routes: maintenanceRoutes,
      message: maintenanceMessage
    });
  } catch (error) {
    res.status(500).json({ message: 'Bakım durumu alınamadı' });
  }
});

router.post('/maintenance/add', auth, async (req, res) => {
  try {
    const { route, message } = req.body;
    
    if (!route) {
      return res.status(400).json({ message: 'Rota bilgisi gerekli' });
    }

    if (!maintenanceRoutes.includes(route)) {
      maintenanceRoutes.push(route);
    }

    if (message) {
      maintenanceMessage = message;
    }

    res.json({ 
      message: 'Rota başarıyla eklendi',
      routes: maintenanceRoutes
    });
  } catch (error) {
    res.status(500).json({ message: 'Rota eklenirken bir hata oluştu' });
  }
});

router.post('/maintenance/remove', auth, async (req, res) => {
  try {
    const { route } = req.body;
    
    if (!route) {
      return res.status(400).json({ message: 'Rota bilgisi gerekli' });
    }

    maintenanceRoutes = maintenanceRoutes.filter(r => r !== route);

    res.json({ 
      message: 'Rota başarıyla kaldırıldı',
      routes: maintenanceRoutes
    });
  } catch (error) {
    res.status(500).json({ message: 'Rota kaldırılırken bir hata oluştu' });
  }
});

router.post('/maintenance/message', auth, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Mesaj bilgisi gerekli' });
    }

    maintenanceMessage = message;

    res.json({ 
      message: 'Bakım mesajı güncellendi',
      maintenanceMessage
    });
  } catch (error) {
    res.status(500).json({ message: 'Mesaj güncellenirken bir hata oluştu' });
  }
});

// Bakım modu middleware
const checkMaintenance = (req, res, next) => {
  const path = req.path;
  
  // Admin rotaları ve API rotaları için bakım modunu kontrol etme
  if (path.startsWith('/api/admin') || path === '/api/maintenance' || path === '/maintenance') {
    return next();
  }

  // Kullanıcı rolünü kontrol et
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role === 'admin' || decoded.role === 'superadmin') {
        return next();
      }
    } catch (error) {
      console.error('Token doğrulama hatası:', error);
    }
  }

  // Path'i normalize et
  const normalizedPath = path.replace('/api/', '/');

  // Rota bakımda mı kontrol et
  if (maintenanceRoutes.some(route => normalizedPath.startsWith(route))) {
    return res.status(503).json({
      message: maintenanceMessage,
      maintenance: true,
      redirectTo: '/maintenance'
    });
  }

  next();
};

// Admin girişi
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.status(401).json({ message: 'Geçersiz kullanıcı adı veya şifre' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Geçersiz kullanıcı adı veya şifre' });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Beta başvurularını listele
router.get('/beta-applications', async (req, res) => {
  try {
    const applications = await BetaSignup.find().sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Beta başvuru durumunu güncelle
router.patch('/beta-applications/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const application = await BetaSignup.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Başvuru bulunamadı' });
    }

    // Eğer başvuru reddedildiyse mail gönder
    if (status === 'rejected') {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: application.email,
        subject: 'Beta Başvurunuz Hakkında',
        html: `
          <h1>Beta Başvurunuz Hakkında</h1>
          <p>Merhaba ${application.name},</p>
          <p>Beta başvurunuz değerlendirilmiş olup, maalesef onaylanmamıştır.</p>
          <p>İlginiz için teşekkür ederiz.</p>
        `
      };

      await transporter.sendMail(mailOptions);
    }

    // Eğer başvuru onaylanıyorsa
    if (status === 'approved') {
      // Önce e-posta ile kayıtlı kullanıcı var mı kontrol et
      let existingUser = await User.findOne({ email: application.email });
      
      if (!existingUser) {
        // Rastgele şifre oluştur
        const password = crypto.randomBytes(8).toString('hex');
        
        // Kullanıcı adını oluştur
        let username = application.name.toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '');
        
        // Benzersiz kullanıcı adı oluştur
        let usernameTaken = true;
        let counter = 1;
        
        while (usernameTaken) {
          const existingUsername = await User.findOne({ 
            username: counter === 1 ? username : `${username}${counter}` 
          });
          if (!existingUsername) {
            username = counter === 1 ? username : `${username}${counter}`;
            usernameTaken = false;
          } else {
            counter++;
          }
        }

        // Yeni kullanıcı oluştur
        const user = new User({
          email: application.email.toLowerCase(),
          username: username,
          password: password, // Bu otomatik olarak hashlenecek
          role: 'beta',
          status: 'active'
        });

        await user.save();
        console.log('Yeni kullanıcı oluşturuldu:', { email: user.email, username: user.username });

        // E-posta gönder
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: application.email,
          subject: 'Beta Başvurunuz Onaylandı',
          html: `
            <h1>Beta Başvurunuz Onaylandı!</h1>
            <p>Merhaba ${application.name},</p>
            <p>Beta başvurunuz onaylanmıştır. Aşağıdaki bilgilerle giriş yapabilirsiniz:</p>
            <p><strong>Kullanıcı Adı:</strong> ${username}</p>
            <p><strong>Şifre:</strong> ${password}</p>
            <p>Güvenliğiniz için lütfen giriş yaptıktan sonra şifrenizi değiştirin.</p>
          `
        };

        await transporter.sendMail(mailOptions);
      }
    }

    // Başvuru durumunu güncelle
    application.status = status;
    await application.save();

    res.json(application);
  } catch (error) {
    console.error('Beta onay hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Kullanıcıları listele
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// TMDB arama endpoint'i
router.get('/tmdb/search', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await axios.get(`https://api.themoviedb.org/3/search/tv`, {
      params: {
        api_key: process.env.TMDB_API_KEY,
        query,
        language: 'tr-TR'
      }
    });

    const animeResults = response.data.results.filter(show => 
      show.genre_ids.includes(16) // 16, animasyon genre ID'si
    );

    res.json(animeResults);
  } catch (error) {
    console.error('TMDB API Hatası:', error);
    res.status(500).json({ message: 'TMDB API hatası', error: error.message });
  }
});

// TMDB'den anime detaylarını al ve veritabanına ekle
router.post('/tmdb/import/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // TMDB'den detaylı bilgileri al
    const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}`, {
      params: {
        api_key: process.env.TMDB_API_KEY,
        language: 'tr-TR',
        append_to_response: 'credits,videos,images'
      }
    });

    // Anime modelini oluştur
    const anime = new Anime({
      title: response.data.name,
      originalTitle: response.data.original_name,
      description: response.data.overview,
      coverImage: `https://image.tmdb.org/t/p/w500${response.data.poster_path}`,
      bannerImage: `https://image.tmdb.org/t/p/original${response.data.backdrop_path}`,
      type: 'TV',
      episodes: response.data.number_of_episodes,
      status: response.data.status === 'Ended' ? 'completed' : 'ongoing',
      releaseDate: response.data.first_air_date,
      endDate: response.data.last_air_date,
      rating: response.data.vote_average,
      genres: response.data.genres.map(g => g.name),
      source: 'TMDB',
      tmdbId: id
    });

    await anime.save();
    res.json(anime);
  } catch (error) {
    console.error('TMDB Import Hatası:', error);
    res.status(500).json({ message: 'TMDB import hatası', error: error.message });
  }
});

// Multer yapılandırması
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/videos');
    // Klasör yoksa oluştur
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Benzersiz dosya adı oluştur
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB
    fieldSize: 5 * 1024 * 1024 * 1024 // 5GB
  },
  fileFilter: function (req, file, cb) {
    // Sadece video dosyalarını kabul et
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece video dosyaları yüklenebilir!'));
    }
  }
});

// Video URL doğrulama fonksiyonu
const isValidVideoUrl = (url, source) => {
  switch (source) {
    case 'youtube':
      return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url);
    case 'drive':
      return /^https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/.test(url);
    case 'direct':
      return /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/.test(url);
    default:
      return false;
  }
};

// URL formatla
const formatVideoUrl = (url, source) => {
  switch (source) {
    case 'youtube':
      // YouTube ID çıkar
      const youtubeId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
      return youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : url;
    case 'drive':
      // Drive URL'ini düzenle
      const driveId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      return driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : url;
    default:
      return url;
  }
};

// Google Drive URL'ini düzenle
const formatDriveUrl = (url) => {
  const drivePattern = /^https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/;
  const match = url.match(drivePattern);
  if (match) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
};

// Google Drive'a yükleme fonksiyonu
const uploadToGoogleDrive = async (fileStream, filename) => {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'video/mp4',
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
      },
      media: {
        mimeType: 'video/mp4',
        body: fileStream
      },
      fields: 'id, webContentLink, webViewLink'
    });

    // Dosyayı herkese açık yap
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    return {
      downloadUrl: response.data.webContentLink,
      viewUrl: response.data.webViewLink
    };
  } catch (error) {
    console.error('Google Drive yükleme hatası:', error);
    throw new Error('Google Drive yükleme hatası: ' + error.message);
  }
};

// Video yükleme endpoint'i - Direct Upload URL
router.post('/get-upload-url', async (req, res) => {
  try {
    const { fileName, fileSize } = req.body;

    if (!fileName || !fileSize) {
      return res.status(400).json({ message: 'Dosya adı ve boyutu gerekli' });
    }

    // 5GB limit kontrolü
    const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
    if (fileSize > maxSize) {
      return res.status(400).json({ message: 'Video dosyası 5GB\'dan büyük olamaz' });
    }

    // Benzersiz dosya adı oluştur
    const uniqueFileName = `videos/${Date.now()}-${fileName}`;
    
    // Bunny Storage CDN URL'ini oluştur
    const cdnUrl = `https://${process.env.BUNNY_STORAGE_ZONE_NAME}.b-cdn.net/${uniqueFileName}`;

    res.json({
      uploadUrl: `https://storage.bunnycdn.com/${process.env.BUNNY_STORAGE_ZONE_NAME}/${uniqueFileName}`,
      cdnUrl: cdnUrl,
      headers: {
        'AccessKey': process.env.BUNNY_STORAGE_API_KEY
      }
    });
  } catch (error) {
    console.error('Upload URL oluşturma hatası:', error);
    res.status(500).json({ 
      message: error.message || 'Upload URL oluşturulurken bir hata oluştu'
    });
  }
});

// Video URL endpoint'i
router.post('/video/url', async (req, res) => {
  try {
    const { url, source } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'Video URL\'i gerekli' });
    }

    // URL'yi doğrula
    if (source && !isValidVideoUrl(url, source)) {
      return res.status(400).json({ message: 'Geçersiz video URL\'i' });
    }

    // URL'yi formatla
    const formattedUrl = source ? formatVideoUrl(url, source) : url;

    res.json({
      url: formattedUrl,
      source: source || 'direct',
      message: 'Video URL\'i başarıyla kaydedildi'
    });
  } catch (error) {
    console.error('Video URL hatası:', error);
    res.status(500).json({ message: 'Video URL\'i işlenirken bir hata oluştu' });
  }
});

// Video yükleme endpoint'i
router.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Lütfen bir video dosyası seçin' });
    }

    // Dosya boyutu kontrolü
    const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
    if (req.file.size > maxSize) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Video dosyası 5GB\'dan büyük olamaz' });
    }

    // Dosya tipi kontrolü
    if (!req.file.mimetype.startsWith('video/')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Sadece video dosyaları yüklenebilir' });
    }

    // Benzersiz dosya adı oluştur
    const fileName = `videos/${Date.now()}-${path.basename(req.file.originalname)}`;

    try {
      // Bunny Storage'a yükle
      const uploadResult = await uploadToBunnyStorage(req.file.path, fileName);

      // Geçici dosyayı sil
      fs.unlinkSync(req.file.path);

      res.json({
        url: uploadResult.url,
        source: 'bunny',
        message: 'Video başarıyla yüklendi'
      });
    } catch (error) {
      // Hata durumunda geçici dosyayı sil
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw error;
    }
  } catch (error) {
    console.error('Video yükleme hatası:', error);
    res.status(500).json({ 
      message: error.message || 'Video yüklenirken bir hata oluştu'
    });
  }
});

// Anime listesini getir
router.get('/animes', async (req, res) => {
  try {
    const animes = await Anime.find();
    res.json(animes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Belirli bir anime'yi getir
router.get('/animes/:id', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }
    res.json(anime);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Anime güncelle
router.patch('/animes/:id', async (req, res) => {
  try {
    const anime = await Anime.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }
    res.json(anime);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Anime sil
router.delete('/animes/:id', async (req, res) => {
  try {
    const anime = await Anime.findByIdAndDelete(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }
    res.json({ message: 'Anime başarıyla silindi' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Sezon ekle
router.post('/animes/:id/seasons', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    // Yeni sezonu ekle
    anime.seasons.push(req.body);
    await anime.save();

    res.json(anime);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Sezon sil
router.delete('/animes/:id/seasons/:seasonNumber', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    // Sezonu bul ve sil
    anime.seasons = anime.seasons.filter(season => season.seasonNumber !== parseInt(req.params.seasonNumber));
    await anime.save();

    res.json(anime);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bölüm ekle
router.post('/animes/:id/seasons/:seasonNumber/episodes', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    const season = anime.seasons.find(s => s.seasonNumber === parseInt(req.params.seasonNumber));
    if (!season) {
      return res.status(404).json({ message: 'Sezon bulunamadı' });
    }

    // Video kaynaklarına source bilgisini ve benzersiz ID ekle
    const episodeData = req.body;
    if (episodeData.videoSources && episodeData.videoSources.length > 0) {
      // Mevcut tüm video kaynaklarını topla
      const existingSources = [];
      anime.seasons.forEach(s => {
        s.episodes.forEach(e => {
          if (e.videoSources) {
            e.videoSources.forEach(v => {
              if (v.sourceId) {
                existingSources.push(v.sourceId);
              }
            });
          }
        });
      });

      episodeData.videoSources = episodeData.videoSources.map(source => {
        // URL'e göre source tipini belirle
        let sourceType = 'direct';
        if (source.url.includes('youtube.com') || source.url.includes('youtu.be')) {
          sourceType = 'youtube';
        } else if (source.url.includes('drive.google.com')) {
          sourceType = 'drive';
        }

        // Benzersiz sourceId oluştur
        let sourceId;
        do {
          sourceId = `${sourceType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        } while (existingSources.includes(sourceId));

        return {
          ...source,
          source: sourceType,
          sourceId
        };
      });
    }

    // Yeni bölümü ekle
    season.episodes.push(episodeData);

    // Anime source bilgisini kontrol et ve yoksa ekle
    if (!anime.source || !anime.source.name) {
      anime.source = {
        name: 'Custom',
        id: 'custom-' + Date.now()
      };
    }

    await anime.save();
    res.json(anime);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bölüm sil
router.delete('/animes/:id/seasons/:seasonNumber/episodes/:episodeNumber', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    const season = anime.seasons.find(s => s.seasonNumber === parseInt(req.params.seasonNumber));
    if (!season) {
      return res.status(404).json({ message: 'Sezon bulunamadı' });
    }

    // Bölümü bul ve sil
    season.episodes = season.episodes.filter(episode => episode.episodeNumber !== parseInt(req.params.episodeNumber));
    await anime.save();

    res.json(anime);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bölüm güncelle
router.patch('/animes/:id/seasons/:seasonNumber/episodes/:episodeNumber', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    const season = anime.seasons.find(s => s.seasonNumber === parseInt(req.params.seasonNumber));
    if (!season) {
      return res.status(404).json({ message: 'Sezon bulunamadı' });
    }

    const episodeIndex = season.episodes.findIndex(e => e.episodeNumber === parseInt(req.params.episodeNumber));
    if (episodeIndex === -1) {
      return res.status(404).json({ message: 'Bölüm bulunamadı' });
    }

    // Video kaynaklarını güncelle
    if (req.body.videoSources) {
      req.body.videoSources = req.body.videoSources.map(source => ({
        ...source,
        sourceId: source.sourceId || `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }));
    }

    // Bölümü güncelle
    season.episodes[episodeIndex] = {
      ...season.episodes[episodeIndex],
      ...req.body,
      episodeNumber: parseInt(req.params.episodeNumber)
    };

    await anime.save();
    res.json(anime);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bölüm ekleme endpoint'i
router.post('/anime/:animeId/season/:seasonNumber/episode', async (req, res) => {
  try {
    const { animeId, seasonNumber } = req.params;
    const episodeData = req.body;

    // Anime'yi bul
    const anime = await Anime.findById(animeId);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    // Sezonu bul
    const season = anime.seasons.find(s => s.seasonNumber === parseInt(seasonNumber));
    if (!season) {
      return res.status(404).json({ message: 'Sezon bulunamadı' });
    }

    // Bölüm numarasının benzersiz olduğunu kontrol et
    const episodeExists = season.episodes.some(e => e.episodeNumber === episodeData.episodeNumber);
    if (episodeExists) {
      return res.status(400).json({ message: 'Bu bölüm numarası zaten kullanılıyor' });
    }

    // Video kaynaklarını doğrula
    if (!episodeData.videoSources || episodeData.videoSources.length === 0) {
      return res.status(400).json({ message: 'En az bir video kaynağı gereklidir' });
    }

    // Yeni bölümü ekle
    season.episodes.push(episodeData);

    // Değişiklikleri kaydet
    await anime.save();

    res.json({
      message: 'Bölüm başarıyla eklendi',
      episode: season.episodes[season.episodes.length - 1]
    });
  } catch (error) {
    console.error('Bölüm ekleme hatası:', error);
    res.status(500).json({ message: 'Bölüm eklenirken bir hata oluştu' });
  }
});

// Kullanıcı rozet güncelleme endpoint'i
router.patch('/users/:userId/badge', async (req, res) => {
  try {
    const { badge } = req.body;
    
    // Kullanıcıyı bul
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Rozeti güncelle
    if (!badge || badge === '') {
      user.badge = 'none';
    } else if (['admin', 'fansub', 'uploader', 'beta', 'vip'].includes(badge)) {
      user.badge = badge;
    } else {
      return res.status(400).json({ message: 'Geçersiz rozet tipi' });
    }

    // Değişiklikleri kaydet
    const updatedUser = await user.save();
    
    // Hassas bilgileri çıkar ve yanıt gönder
    const userResponse = updatedUser.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordToken;
    delete userResponse.resetPasswordExpires;

    res.json({
      message: badge === 'none' ? 'Rozet başarıyla kaldırıldı' : 'Rozet başarıyla atandı',
      user: userResponse
    });
  } catch (error) {
    console.error('Rozet işlemi hatası:', error);
    res.status(500).json({ 
      message: 'Rozet işlemi sırasında bir hata oluştu',
      error: error.message 
    });
  }
});

// Bildirimleri getir
router.get('/notifications', [auth, adminAuth], async (req, res) => {
  try {
    const notifications = await User.aggregate([
      { $unwind: '$notifications' },
      { $sort: { 'notifications.createdAt': -1 } },
      { $group: {
        _id: null,
        notifications: { $push: '$notifications' }
      }},
      { $project: { _id: 0, notifications: 1 } }
    ]);

    res.json(notifications.length > 0 ? notifications[0].notifications : []);
  } catch (error) {
    console.error('Bildirimler yüklenirken hata:', error);
    res.status(500).json({ message: 'Bildirimler yüklenirken bir hata oluştu' });
  }
});

// Bildirim gönder
router.post('/notifications', [auth, adminAuth], async (req, res) => {
  try {
    const { title, message, target, userIds } = req.body;

    let users;
    switch (target) {
      case 'all':
        users = await User.find();
        break;
      case 'beta':
        users = await User.find({ role: 'beta' });
        break;
      case 'premium':
        users = await User.find({ role: 'premium' });
        break;
      case 'specific':
        if (!userIds || userIds.length === 0) {
          return res.status(400).json({ message: 'Kullanıcı ID\'leri gerekli' });
        }
        users = await User.find({ _id: { $in: userIds } });
        break;
      default:
        return res.status(400).json({ message: 'Geçersiz hedef kitle' });
    }

    const notification = {
      title,
      message,
      type: 'system',
      createdAt: new Date(),
      read: false
    };

    const updatePromises = users.map(user => {
      user.notifications.unshift(notification);
      return user.save();
    });

    await Promise.all(updatePromises);

    res.json({ 
      message: 'Bildirim başarıyla gönderildi',
      notification,
      recipientCount: users.length
    });
  } catch (error) {
    console.error('Bildirim gönderme hatası:', error);
    res.status(500).json({ message: 'Bildirim gönderilirken bir hata oluştu' });
  }
});

// Bildirim silme endpoint'i
router.delete('/notifications/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const updateResult = await User.updateMany(
      { 'notifications._id': id },
      { $pull: { notifications: { _id: id } } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(404).json({ message: 'Bildirim bulunamadı' });
    }

    res.json({ message: 'Bildirim başarıyla silindi' });
  } catch (error) {
    console.error('Bildirim silme hatası:', error);
    res.status(500).json({ message: 'Bildirim silinirken bir hata oluştu' });
  }
});

// Toplu bölüm yükleme endpoint'i
router.post('/animes/:id/bulk-upload', auth, adminAuth, async (req, res) => {
  try {
    const { seasonNumber, folderId, fansub, quality, language, type } = req.body;

    // Anime'yi bul
    const anime = await Anime.findById(req.params.id);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    // Sezonu bul
    const season = anime.seasons.find(s => s.seasonNumber === parseInt(seasonNumber));
    if (!season) {
      return res.status(404).json({ message: 'Sezon bulunamadı' });
    }

    // Google Drive klasöründeki dosyaları listele
    try {
      console.log('=== TOPLU YÜKLEME BAŞLATILIYOR ===');
      console.log('Anime:', anime.title);
      console.log('Sezon:', seasonNumber);
      console.log('Klasör ID:', folderId);
      
      // Drive URL'inden ID'yi çıkar
      const folderIdMatch = folderId.match(/[-\w]{25,}/);
      const cleanFolderId = folderIdMatch ? folderIdMatch[0] : folderId;
      
      console.log('Temizlenmiş Klasör ID:', cleanFolderId);

      try {
        // Önce klasörün varlığını kontrol et
        const folder = await drive.files.get({
          fileId: cleanFolderId,
          fields: 'id, name, mimeType',
          supportsAllDrives: true
        });
        
        console.log('Klasör bilgisi:', folder.data);

        if (folder.data.mimeType !== 'application/vnd.google-apps.folder') {
          return res.status(400).json({ message: 'Geçersiz klasör ID\'si - Bu bir klasör değil' });
        }

        // Dosyaları listele
        const files = await drive.files.list({
          q: `'${cleanFolderId}' in parents and (mimeType contains 'video/' or name contains '.mp4' or name contains '.mkv')`,
          fields: 'files(id, name, size, mimeType)',
          orderBy: 'name',
          pageSize: 1000,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });

        console.log('\n=== BULUNAN DOSYALAR ===');
        console.log('Toplam dosya sayısı:', files.data.files.length);
        files.data.files.forEach((file, index) => {
          console.log(`${index + 1}. ${file.name} (${Math.round(file.size / 1024 / 1024)}MB)`);
        });

        if (!files.data.files.length) {
          return res.status(404).json({ 
            message: 'Klasörde video dosyası bulunamadı',
            totalFiles: 0,
            tip: 'Lütfen klasörün ve dosyaların erişilebilir olduğundan emin olun.'
          });
        }

        // İşlemi başlat ve hemen yanıt ver
        res.json({ 
          message: 'Bölüm yükleme işlemi başlatıldı',
          totalFiles: files.data.files.length,
          files: files.data.files.map(f => f.name)
        });

        // İstatistik değişkenleri
        let stats = {
          total: files.data.files.length,
          processed: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
          startTime: Date.now()
        };

        // Arka planda işleme devam et
        (async () => {
          try {
            console.log('\n=== YÜKLEME İŞLEMİ BAŞLIYOR ===');
            
            for (const file of files.data.files) {
              stats.processed++;
              const progress = ((stats.processed / stats.total) * 100).toFixed(2);
              const elapsedTime = Math.round((Date.now() - stats.startTime) / 1000);
              
              console.log(`\n--- Dosya ${stats.processed}/${stats.total} (${progress}%) ---`);
              console.log('İşlem süresi:', elapsedTime, 'saniye');
              console.log('Dosya:', file.name);

              try {
                // Dosya adından bölüm numarasını çıkar
                const episodeNumber = parseInt(file.name.match(/\d+/)?.[0]);
                if (!episodeNumber) {
                  console.log('❌ Bölüm numarası bulunamadı, atlanıyor');
                  stats.skipped++;
                  continue;
                }

                // Bölüm zaten var mı kontrol et
                const existingEpisode = season.episodes.find(e => e.episodeNumber === episodeNumber);
                if (existingEpisode) {
                  console.log(`⚠️ Bölüm ${episodeNumber} zaten mevcut, atlanıyor`);
                  stats.skipped++;
                  continue;
                }

                // Dosyaya erişim kontrolü
                try {
                  await drive.files.get({
                    fileId: file.id,
                    fields: 'id',
                    supportsAllDrives: true
                  });
                } catch (error) {
                  console.error(`❌ Dosyaya erişim hatası (Bölüm ${episodeNumber}):`, error.message);
                  stats.failed++;
                  continue;
                }

                console.log('✓ Google Drive erişimi başarılı');
                console.log('⏳ Drive\'dan indiriliyor...');

                // Google Drive'dan dosyayı stream olarak al
                const driveResponse = await drive.files.get(
                  { 
                    fileId: file.id, 
                    alt: 'media',
                    supportsAllDrives: true
                  },
                  { 
                    responseType: 'stream',
                    headers: {
                      Range: 'bytes=0-'
                    }
                  }
                );

                // Bunny Storage'a yüklenecek dosya adını oluştur
                const sanitizedAnimeName = (anime.title || 'anime')
                  .toString()
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '');

                const storageFolder = `${sanitizedAnimeName}/sezon-${seasonNumber}`;
                const fileName = `${storageFolder}/${episodeNumber}.mp4`;
                console.log('⏳ Bunny Storage\'a yükleniyor:', fileName);

                try {
                  // Bunny Storage'a doğrudan stream ile yükle
                  const uploadUrl = `https://storage.bunnycdn.com/${process.env.BUNNY_STORAGE_ZONE_NAME}/${fileName}`;
                  
                  await new Promise((resolve, reject) => {
                    let uploadedBytes = 0;
                    const uploadStream = axios.put(uploadUrl, driveResponse.data, {
                      headers: {
                        'AccessKey': process.env.BUNNY_STORAGE_API_KEY,
                        'Content-Type': 'video/mp4',
                        'Transfer-Encoding': 'chunked'
                      },
                      maxContentLength: Infinity,
                      maxBodyLength: Infinity,
                      onUploadProgress: (progressEvent) => {
                        uploadedBytes = progressEvent.loaded;
                        console.log(`Yüklenen: ${(uploadedBytes / (1024 * 1024)).toFixed(2)} MB`);
                      }
                    });

                    // Memory leak'i önlemek için stream'i temizle
                    driveResponse.data.on('end', () => {
                      driveResponse.data.destroy();
                    });

                    uploadStream.then(resolve).catch((error) => {
                      driveResponse.data.destroy();
                      reject(error);
                    });
                  });

                  console.log('✓ Bunny Storage yüklemesi başarılı');

                  // Yeni bölüm oluştur
                  const newEpisode = {
                    episodeNumber,
                    title: `Bölüm ${episodeNumber}`,
                    description: `${anime.title} ${episodeNumber}. Bölüm`,
                    thumbnail: anime.coverImage,
                    duration: '',
                    seasonNumber: parseInt(seasonNumber),
                    status: 'published',
                    publishedAt: new Date(),
                    order: episodeNumber,
                    videoSources: [{
                      quality,
                      language,
                      type,
                      url: `https://${process.env.BUNNY_STORAGE_ZONE_NAME}.b-cdn.net/${fileName}`,
                      source: 'bunny',
                      fansub,
                      status: 'active'
                    }]
                  };

                  // Bölümü sezona ekle ve sırala
                  season.episodes.push(newEpisode);
                  season.episodes.sort((a, b) => a.order - b.order); // Bölümleri sırala
                  stats.successful++;
                  
                  // Her başarılı bölüm sonrası değişiklikleri kaydet
                  await anime.save();
                  
                  console.log('✓ Bölüm veritabanına eklendi');
                  console.log('✓ Bölüm yayına alındı');
                  console.log('✅ Bölüm işlemi başarıyla tamamlandı');

                } catch (uploadError) {
                  console.error('❌ Bunny Storage yükleme hatası:', uploadError.message);
                  stats.failed++;
                  continue;
                }

              } catch (fileError) {
                console.error('❌ Dosya işleme hatası:', fileError.message);
                stats.failed++;
                continue;
              }

              // İstatistikleri göster
              console.log('\n--- GÜNCEL İSTATİSTİKLER ---');
              console.log(`Toplam: ${stats.total}`);
              console.log(`İşlenen: ${stats.processed} (${((stats.processed / stats.total) * 100).toFixed(2)}%)`);
              console.log(`Başarılı: ${stats.successful}`);
              console.log(`Başarısız: ${stats.failed}`);
              console.log(`Atlanan: ${stats.skipped}`);
              console.log(`Geçen süre: ${Math.round((Date.now() - stats.startTime) / 1000)} saniye`);
            }

            // Değişiklikleri kaydet
            await anime.save();
            const totalTime = Math.round((Date.now() - stats.startTime) / 1000);
            
            console.log('\n=== TOPLU YÜKLEME TAMAMLANDI ===');
            console.log('Anime:', anime.title);
            console.log('Sezon:', seasonNumber);
            console.log('Toplam süre:', totalTime, 'saniye');
            console.log('Toplam dosya:', stats.total);
            console.log('Başarılı:', stats.successful);
            console.log('Başarısız:', stats.failed);
            console.log('Atlanan:', stats.skipped);
            console.log('Ortalama süre:', (totalTime / stats.total).toFixed(2), 'saniye/dosya');
            console.log('================================\n');

          } catch (error) {
            console.error('\n❌ TOPLU YÜKLEME HATASI:', error.message);
            console.error('İşlem yarıda kesildi');
            console.log('--- SON İSTATİSTİKLER ---');
            console.log(`Toplam: ${stats.total}`);
            console.log(`İşlenen: ${stats.processed}`);
            console.log(`Başarılı: ${stats.successful}`);
            console.log(`Başarısız: ${stats.failed}`);
            console.log(`Atlanan: ${stats.skipped}`);
            console.log('========================\n');
          }
        })();

      } catch (error) {
        if (error.code === 404) {
          console.error('❌ Klasör bulunamadı veya erişim izni yok');
          return res.status(404).json({ message: 'Klasör bulunamadı veya erişim izniniz yok' });
        }
        throw error;
      }

    } catch (error) {
      console.error('❌ Toplu yükleme hatası:', error.message);
      res.status(500).json({ 
        message: 'Bölümler yüklenirken bir hata oluştu',
        error: error.message
      });
    }

  } catch (error) {
    console.error('❌ Toplu yükleme hatası:', error.message);
    res.status(500).json({ message: 'Bölümler yüklenirken bir hata oluştu' });
  }
});

// Fansub listesini getir
router.get('/fansubs', [auth, adminAuth], async (req, res) => {
  try {
    const fansubs = await Fansub.find().sort({ name: 1 });
    res.json(fansubs);
  } catch (error) {
    console.error('Fansub listesi getirme hatası:', error);
    res.status(500).json({ message: 'Fansub listesi alınırken bir hata oluştu' });
  }
});

module.exports = router;

// Bakım modu middleware'ini ayrı export et
module.exports.checkMaintenance = checkMaintenance; 