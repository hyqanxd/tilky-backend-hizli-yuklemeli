const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Anime = require('../models/Anime');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const { uploadToBunnyStorage } = require('../utils/bunnyStorage');
const ffmpeg = require('fluent-ffmpeg');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join('/tmp', 'uploads', 'profile-images');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
  }
});

// Configure multer for banner upload
const bannerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join('/tmp', 'uploads', 'banners');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadBanner = multer({
  storage: bannerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
  }
});

// Configure multer for music upload
const musicStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join('/tmp', 'uploads', 'music');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadMusic = multer({
  storage: musicStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 2MB limit
  },
  fileFilter: function (req, file, cb) {
    const isOpus = file.mimetype === 'audio/opus' || file.originalname.toLowerCase().endsWith('.opus');
    if (isOpus) {
      return cb(null, true);
    } else {
      cb(new Error('Sadece .opus formatında müzik dosyaları yüklenebilir! (Daha küçük boyut için)'));
    }
  }
});

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Kullanıcı girişi
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    // E-posta veya kullanıcı adı ile kullanıcıyı bul
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    });

    if (!user) {
      console.log('Kullanıcı bulunamadı:', identifier);
      return res.status(401).json({ 
        message: 'Geçersiz kullanıcı adı/e-posta veya şifre' 
      });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ 
        message: 'Hesabınız engellenmiştir' 
      });
    }

    const isMatch = await user.comparePassword(password);
    console.log('Şifre kontrolü:', { isMatch, userId: user._id });

    if (!isMatch) {
      return res.status(401).json({ 
        message: 'Geçersiz kullanıcı adı/e-posta veya şifre' 
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Login hatası:', error);
    res.status(500).json({ 
      message: 'Sunucu hatası', 
      error: error.message 
    });
  }
});

// Kullanıcı profili
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('watchList')
      .populate('favorites')
      .populate({
        path: 'watchHistory',
        populate: {
          path: 'anime'
        }
      });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Profil bilgileri alınamadı' });
  }
});

// Profil güncelleme
router.patch('/profile', auth, async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['username', 'email', 'profileImage'];
    
    // Sadece izin verilen alanların güncellenmesini sağla
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    const user = await User.findByIdAndUpdate(
      req.user.id,
      filteredUpdates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Şifre değiştirme
router.patch('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mevcut şifre yanlış' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Şifre başarıyla güncellendi' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// İzleme listesine anime ekleme/çıkarma
router.patch('/watchlist/:animeId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const animeIndex = user.watchList.indexOf(req.params.animeId);
    
    if (animeIndex > -1) {
      user.watchList.splice(animeIndex, 1);
    } else {
      user.watchList.push(req.params.animeId);
    }
    
    await user.save();
    await user.populate('watchList');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'İzleme listesi güncellenemedi' });
  }
});

// Favorilere anime ekleme/çıkarma
router.patch('/favorites/:animeId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const animeIndex = user.favorites.indexOf(req.params.animeId);
    
    if (animeIndex > -1) {
      user.favorites.splice(animeIndex, 1);
    } else {
      user.favorites.push(req.params.animeId);
    }
    
    await user.save();
    await user.populate('favorites');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Favoriler güncellenemedi' });
  }
});

// Bildirimleri getir
router.get('/notifications', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user.notifications);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Bildirimleri okundu olarak işaretle
router.patch('/notifications/read', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    user.notifications.forEach(notification => {
      notification.read = true;
    });
    
    await user.save();
    res.json(user.notifications);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Profil fotoğrafı güncelleme
router.patch('/profile/photo', auth, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Lütfen bir resim dosyası yükleyin' });
    }

    try {
      // Bunny Storage'a yükle
      const fileName = `profile-images/${Date.now()}-${path.basename(req.file.originalname)}`;
      const uploadResult = await uploadToBunnyStorage(req.file.path, fileName);

      // Geçici dosyayı sil
      fs.unlinkSync(req.file.path);

      // Kullanıcı bilgilerini güncelle
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { profileImage: uploadResult.url },
        { new: true }
      )
      .select('-password')
      .populate('watchList')
      .populate('favorites');

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        message: 'Profil fotoğrafı başarıyla güncellendi',
        user,
        token
      });
    } catch (uploadError) {
      // Yükleme hatası durumunda geçici dosyayı sil
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw uploadError;
    }
  } catch (error) {
    console.error('Profil fotoğrafı yükleme hatası:', error);
    res.status(500).json({ 
      message: 'Profil fotoğrafı yüklenirken bir hata oluştu',
      error: error.message 
    });
  }
});

// Kullanıcı adı güncelleme
router.patch('/profile/username', auth, async (req, res) => {
  try {
    const { username } = req.body;

    // Kullanıcı adı kontrolü - büyük/küçük harf duyarsız kontrol
    const usernameRegex = new RegExp('^' + username + '$', 'i');
    const existingUser = await User.findOne({ 
      username: usernameRegex,
      _id: { $ne: req.user.id }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Bu kullanıcı adı zaten kullanılıyor' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { username: username.toLowerCase() }, // Kullanıcı adını küçük harfe çevir
      { new: true }
    ).select('-password');

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Kullanıcı adı başarıyla güncellendi',
      user,
      token
    });
  } catch (error) {
    console.error('Kullanıcı adı güncelleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Şifre değiştirme
router.patch('/profile/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mevcut şifre yanlış' });
    }

    user.password = newPassword;
    await user.save();

    // Send email notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Şifreniz Değiştirildi',
      html: `
        <h1>Şifre Değişikliği Bildirimi</h1>
        <p>Merhaba ${user.username},</p>
        <p>Hesabınızın şifresi az önce değiştirildi. Eğer bu değişikliği siz yapmadıysanız, lütfen hemen bizimle iletişime geçin.</p>
        <p>Saygılarımızla,<br>AniTilky Ekibi</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: 'Şifreniz başarıyla güncellendi' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Şifre sıfırlama
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        message: 'Yeni şifre gereklidir.'
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.'
      });
    }

    try {
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      // Send confirmation email
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Şifreniz Başarıyla Değiştirildi',
        html: `
          <h1>Şifre Değişikliği Onayı</h1>
          <p>Merhaba ${user.username},</p>
          <p>Hesabınızın şifresi başarıyla değiştirildi.</p>
          <p>Eğer bu değişikliği siz yapmadıysanız, lütfen hemen bizimle iletişime geçin.</p>
          <p>Saygılarımızla,<br>AniTilky Ekibi</p>
        `
      };

      await transporter.sendMail(mailOptions);

      res.json({ message: 'Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz...' });
    } catch (saveError) {
      console.error('Şifre kaydetme hatası:', saveError);
      return res.status(500).json({ 
        message: 'Şifre güncellenirken bir hata oluştu. Lütfen tekrar deneyin.',
        error: saveError.message 
      });
    }
  } catch (error) {
    console.error('Şifre sıfırlama hatası:', error);
    res.status(500).json({ 
      message: 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.',
      error: error.message 
    });
  }
});

// Şifre sıfırlama isteği
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        message: 'E-posta adresi gereklidir.'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ 
        message: 'Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı.' 
      });
    }

    // Önceki token'ları iptal et
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // Yeni token oluştur
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 saat geçerli

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    
    try {
      await user.save();

      // E-posta gönder
      const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
      console.log('Reset URL:', resetUrl); // Debug için

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Şifre Sıfırlama İsteği',
        html: `
          <h1>Şifre Sıfırlama İsteği</h1>
          <p>Merhaba ${user.username},</p>
          <p>Hesabınız için bir şifre sıfırlama isteği aldık. Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
          <a href="${resetUrl}" style="padding: 10px 20px; background-color: #FF0000; color: white; text-decoration: none; border-radius: 5px;">Şifremi Sıfırla</a>
          <p>Veya bu linki tarayıcınıza kopyalayın:</p>
          <p>${resetUrl}</p>
          <p>Bu bağlantı 1 saat süreyle geçerlidir.</p>
          <p>Not: Bu yeni istek ile önceki şifre sıfırlama bağlantıları geçersiz kılınmıştır.</p>
          <p>Eğer bu isteği siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
          <p>Saygılarımızla,<br>AniTilky Ekibi</p>
        `
      };

      await transporter.sendMail(mailOptions);

      res.json({ 
        message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.',
        success: true 
      });
    } catch (saveError) {
      console.error('Token kaydetme hatası:', saveError);
      return res.status(500).json({ 
        message: 'Şifre sıfırlama işlemi başlatılırken bir hata oluştu. Lütfen tekrar deneyin.',
        error: saveError.message 
      });
    }
  } catch (error) {
    console.error('Şifre sıfırlama isteği hatası:', error);
    res.status(500).json({ 
      message: 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.',
      error: error.message 
    });
  }
});

// Token doğrulama endpoint'i
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    console.log('Verifying token:', token); // Debug için

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    console.log('Found user:', user ? 'Yes' : 'No'); // Debug için

    if (!user) {
      return res.status(400).json({
        message: 'Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.',
        isValid: false
      });
    }

    res.json({
      message: 'Token geçerli.',
      isValid: true
    });
  } catch (error) {
    console.error('Token doğrulama hatası:', error);
    res.status(500).json({
      message: 'Token doğrulanırken bir hata oluştu.',
      isValid: false,
      error: error.message
    });
  }
});

// İzleme geçmişi endpoint'i
router.get('/watch-history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'watchHistory.anime',
        select: 'title coverImage'
      });
    
    res.json(user.watchHistory);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// İzleme geçmişine kayıt ekleme
router.post('/watch-history', auth, async (req, res) => {
  try {
    const { animeId, seasonNumber, episodeNumber, progress } = req.body;
    const user = await User.findById(req.user.id);
    
    await user.addToWatchHistory(animeId, seasonNumber, episodeNumber, progress);
    
    // İzleme listesine otomatik ekleme
    if (!user.watchList.includes(animeId)) {
      user.watchList.push(animeId);
      await user.save();
    }

    res.json(user.watchHistory);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// İzleme geçmişinden kayıt silme
router.delete('/watch-history/:animeId/:seasonNumber/:episodeNumber', auth, async (req, res) => {
  try {
    const { animeId, seasonNumber, episodeNumber } = req.params;
    const user = await User.findById(req.user.id);
    
    user.watchHistory = user.watchHistory.filter(
      entry => 
        !(entry.anime.toString() === animeId &&
          entry.episode.seasonNumber === parseInt(seasonNumber) &&
          entry.episode.episodeNumber === parseInt(episodeNumber))
    );
    
    await user.save();
    res.json(user.watchHistory);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Kullanıcı tercihlerini güncelleme
router.patch('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (req.body.emailNotifications) {
      user.preferences.emailNotifications = {
        ...user.preferences.emailNotifications,
        ...req.body.emailNotifications
      };
    }
    
    if (req.body.theme) {
      user.preferences.theme = req.body.theme;
    }
    
    if (req.body.language) {
      user.preferences.language = req.body.language;
    }
    
    await user.save();
    res.json(user.preferences);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Bildirimleri temizle
router.delete('/notifications', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.notifications = [];
    await user.save();
    res.json({ message: 'Bildirimler temizlendi' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Kullanıcı profili görüntüleme endpoint'i
router.get('/profile/:username', async (req, res) => {
  try {
    // Büyük/küçük harf duyarsız arama için regex kullan
    const usernameRegex = new RegExp('^' + req.params.username + '$', 'i');
    const user = await User.findOne({ username: usernameRegex })
      .populate('watchList')
      .populate('favorites')
      .populate({
        path: 'watchHistory',
        populate: {
          path: 'anime'
        }
      });
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Hassas bilgileri çıkar
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordToken;
    delete userResponse.resetPasswordExpires;

    res.json(userResponse);
  } catch (error) {
    console.error('Profil getirme hatası:', error);
    res.status(500).json({ message: 'Profil bilgileri alınamadı' });
  }
});

// Bio güncelleme endpoint'i
router.patch('/profile/bio', auth, async (req, res) => {
  try {
    const { bio } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    user.bio = bio;
    await user.save();

    res.json(user);
  } catch (error) {
    console.error('Bio güncelleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Banner güncelleme
router.patch('/profile/banner', auth, uploadBanner.single('bannerImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Lütfen bir resim dosyası yükleyin' });
    }

    try {
      // Bunny Storage'a yükle
      const fileName = `banners/${Date.now()}-${path.basename(req.file.originalname)}`;
      const uploadResult = await uploadToBunnyStorage(req.file.path, fileName);

      // Geçici dosyayı sil
      fs.unlinkSync(req.file.path);

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { bannerImage: uploadResult.url },
        { new: true }
      )
      .select('-password')
      .populate('watchList')
      .populate('favorites');

      res.json({
        message: 'Banner başarıyla güncellendi',
        user
      });
    } catch (uploadError) {
      // Yükleme hatası durumunda geçici dosyayı sil
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw uploadError;
    }
  } catch (error) {
    console.error('Banner yükleme hatası:', error);
    res.status(500).json({ 
      message: 'Banner yüklenirken bir hata oluştu',
      error: error.message 
    });
  }
});

// Profil ayarları endpoint'i
router.get('/profile/settings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('watchList')
      .populate('favorites');
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    res.json({
      email: user.email,
      username: user.username,
      profileImage: user.profileImage,
      bannerImage: user.bannerImage,
      preferences: user.preferences,
      notifications: user.notifications,
      bio: user.bio
    });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Profil ayarlarını güncelleme endpoint'i
router.patch('/profile/settings', auth, async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['email', 'username', 'preferences', 'bio'];
    
    // Sadece izin verilen alanların güncellenmesini sağla
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    // Kullanıcı adı değiştiriliyorsa benzersiz olduğunu kontrol et
    if (updates.username) {
      const existingUser = await User.findOne({ 
        username: updates.username,
        _id: { $ne: req.user.id }
      });
      
      if (existingUser) {
        return res.status(400).json({ message: 'Bu kullanıcı adı zaten kullanılıyor' });
      }
    }

    // E-posta değiştiriliyorsa benzersiz olduğunu kontrol et
    if (updates.email) {
      const existingUser = await User.findOne({ 
        email: updates.email.toLowerCase(),
        _id: { $ne: req.user.id }
      });
      
      if (existingUser) {
        return res.status(400).json({ message: 'Bu e-posta adresi zaten kullanılıyor' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      filteredUpdates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Bildirim ayarlarını güncelleme endpoint'i
router.patch('/profile/notification-settings', auth, async (req, res) => {
  try {
    const { emailNotifications } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    user.preferences.emailNotifications = {
      ...user.preferences.emailNotifications,
      ...emailNotifications
    };

    await user.save();
    res.json(user.preferences);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// İzleme geçmişi detaylı endpoint'i
router.get('/profile/history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'watchHistory.anime',
        select: 'title coverImage episodes rating genres'
      });
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    // İzleme geçmişini tarihe göre sırala
    const sortedHistory = user.watchHistory.sort((a, b) => 
      new Date(b.episode.watchedAt) - new Date(a.episode.watchedAt)
    );

    res.json(sortedHistory);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Favoriler detaylı endpoint'i
router.get('/profile/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'favorites',
        select: 'title coverImage rating genres status'
      });
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    res.json(user.favorites);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Rozet görünürlüğünü güncelle
router.patch('/users/:userId/badge/visibility', auth, async (req, res) => {
  try {
    const { badgeId, isVisible } = req.body;
    
    // Kullanıcıyı bul
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Yalnızca kendi rozetini güncelleyebilir
    if (user._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bu işlem için yetkiniz yok' });
    }

    // Rozet görünürlüğünü güncelle
    if (user.customBadge) {
      user.customBadge.isVisible = isVisible;
      await user.save();

      // Hassas bilgileri çıkar
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.resetPasswordToken;
      delete userResponse.resetPasswordExpires;

      res.json({
        message: 'Rozet görünürlüğü güncellendi',
        user: userResponse
      });
    } else {
      res.status(400).json({ message: 'Kullanıcının rozeti bulunmuyor' });
    }
  } catch (error) {
    console.error('Rozet görünürlüğü güncelleme hatası:', error);
    res.status(500).json({ 
      message: 'Rozet görünürlüğü güncellenirken bir hata oluştu',
      error: error.message 
    });
  }
});

// Tüm kullanıcıları getir
router.get('/users', async (req, res) => {
  try {
    const users = await User.find(
      {}, 
      {
        username: 1,
        profileImage: 1,
        role: 1,
        lastActive: 1,
        createdAt: 1
      }
    ).sort({ 
      role: 1,  // Önce role göre sırala
      lastActive: -1  // Sonra son aktif zamana göre sırala
    });

    // Kullanıcıları role göre grupla ve sırala
    const sortedUsers = users.sort((a, b) => {
      const roleOrder = {
        'superadmin': 1,
        'admin': 2,
        'beta': 3,
        'user': 4
      };
      
      // Önce role göre sırala
      const roleDiff = roleOrder[a.role] - roleOrder[b.role];
      if (roleDiff !== 0) return roleDiff;
      
      // Aynı role sahip kullanıcıları son aktif zamana göre sırala
      return new Date(b.lastActive) - new Date(a.lastActive);
    });

    res.json(sortedUsers);
  } catch (error) {
    console.error('Kullanıcılar getirilirken hata:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Profil müziği yükleme endpoint'i
router.patch('/profile/music', auth, uploadMusic.single('profileMusic'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    if (!req.file) {
      return res.status(400).json({ 
        message: 'Müzik dosyası yüklenmedi',
        details: 'Lütfen .opus formatında bir müzik dosyası yükleyin. Diğer formatlar desteklenmemektedir. Maksimum dosya boyutu: 5MB'
      });
    }

    try {
      // Bunny Storage'a direkt yükleme
      const fileName = `music/${Date.now()}-${path.basename(req.file.originalname)}`;
      const uploadResult = await uploadToBunnyStorage(req.file.path, fileName);

      // Geçici dosyayı temizle
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // Kullanıcı bilgilerini güncelle
      user.profileMusic = uploadResult.url;
      await user.save();

      console.log('Kullanıcı profili güncellendi');

      res.json({ 
        message: 'Profil müziği başarıyla güncellendi',
        user: user
      });
    } catch (uploadError) {
      // Yükleme hatası durumunda geçici dosyayı temizle
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw uploadError;
    }
  } catch (error) {
    console.error('Profil müziği yükleme hatası:', error);

    // Geçici dosyayı temizle
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ 
      message: 'Müzik dosyası yüklenirken bir hata oluştu',
      error: error.message 
    });
  }
});

// Profil müziğini silme endpoint'i
router.delete('/profile/music', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Eski müzik dosyasını sil
    if (user.profileMusic) {
      const filePath = path.join(__dirname, '..', 'public', user.profileMusic);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    user.profileMusic = null;
    await user.save();

    res.json({ 
      message: 'Profil müziği başarıyla silindi',
      user: user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Kullanıcı takip etme/takipten çıkma
router.post('/follow/:userId', auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUser = await User.findById(req.user.id);

    if (currentUser._id.toString() === targetUserId) {
      return res.status(400).json({ message: 'Kendinizi takip edemezsiniz' });
    }

    const result = await currentUser.toggleFollow(targetUserId);
    res.json(result);
  } catch (error) {
    console.error('Takip işlemi hatası:', error);
    res.status(500).json({ message: error.message || 'Takip işlemi başarısız oldu' });
  }
});

// Takip durumu kontrolü
router.get('/follow-status/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const isFollowing = currentUser.following.includes(req.params.userId);
    res.json({ isFollowing });
  } catch (error) {
    res.status(500).json({ message: 'Takip durumu kontrol edilemedi' });
  }
});

// Takipçileri getir
router.get('/followers/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('followers', 'username profileImage role');
    res.json(user.followers);
  } catch (error) {
    res.status(500).json({ message: 'Takipçiler getirilemedi' });
  }
});

// Takip edilenleri getir
router.get('/following/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('following', 'username profileImage role');
    res.json(user.following);
  } catch (error) {
    res.status(500).json({ message: 'Takip edilenler getirilemedi' });
  }
});

// Manga izleme listesine ekleme/çıkarma
router.patch('/manga-watchlist/:mangaId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const mangaIndex = user.mangaWatchList.indexOf(req.params.mangaId);
    
    if (mangaIndex > -1) {
      user.mangaWatchList.splice(mangaIndex, 1);
    } else {
      user.mangaWatchList.push(req.params.mangaId);
    }
    
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'İşlem başarısız oldu', error: error.message });
  }
});

// Manga favorilerine ekleme/çıkarma
router.patch('/manga-favorites/:mangaId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const mangaIndex = user.mangaFavorites.indexOf(req.params.mangaId);
    
    if (mangaIndex > -1) {
      user.mangaFavorites.splice(mangaIndex, 1);
    } else {
      user.mangaFavorites.push(req.params.mangaId);
    }
    
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'İşlem başarısız oldu', error: error.message });
  }
});

// Kullanıcı kaydı
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // E-posta ve kullanıcı adı kontrolü
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ message: 'Bu e-posta adresi zaten kullanılıyor' });
      }
      if (existingUser.username === username.toLowerCase()) {
        return res.status(400).json({ message: 'Bu kullanıcı adı zaten kullanılıyor' });
      }
    }

    // Yeni kullanıcı oluştur
    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      role: 'user',
      status: 'active'
    });

    await user.save();

    // Token oluştur
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Hoş geldin e-postası gönder
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'AniTilky\'ye Hoş Geldiniz!',
      html: `
        <h1>AniTilky\'ye Hoş Geldiniz!</h1>
        <p>Merhaba ${user.username},</p>
        <p>AniTilky\'ye kayıt olduğunuz için teşekkür ederiz. Artık tüm özellikleri kullanabilirsiniz.</p>
        <p>Saygılarımızla,<br>AniTilky Ekibi</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      message: 'Kayıt başarılı',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ 
      message: 'Kayıt işlemi başarısız oldu',
      error: error.message 
    });
  }
});

module.exports = router; 