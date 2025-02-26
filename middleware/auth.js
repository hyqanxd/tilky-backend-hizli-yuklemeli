const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Callback ve roles endpoint'leri için auth kontrolünü atla
    if (req.path === '/callback' || (req.path === '/roles' && req.method === 'GET')) {
      return next();
    }

    console.log('Auth middleware - headers:', req.headers);
    
    // Token'ı al
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                 req.headers.authorization?.split(' ')[1];
                 
    if (!token) {
      console.log('Token bulunamadı');
      return res.status(401).json({ message: 'Yetkilendirme token\'ı gerekli' });
    }

    // Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    // Kullanıcıyı bul
    const user = await User.findById(decoded.userId || decoded.id);
    if (!user) {
      console.log('Kullanıcı bulunamadı:', decoded.userId || decoded.id);
      return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Kullanıcıyı request'e ekle
    req.user = user;
    req.token = token;

    console.log('Auth başarılı - user:', { 
      id: user.id,
      _id: user._id,
      username: user.username,
      discordId: user.discordId 
    });

    next();
  } catch (error) {
    console.error('Auth middleware hatası:', error);
    res.status(401).json({ 
      message: 'Lütfen giriş yapın', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = auth; 