const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                 req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Yetkilendirme token\'ı bulunamadı' });
    }

    // Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Kullanıcıyı veritabanından al
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
    }

    // Admin kontrolü
    if (!['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({ message: 'Bu işlem için admin yetkisi gerekiyor' });
    }

    // Admin bilgilerini req.admin'e ekle
    req.admin = {
      id: user._id,
      username: user.username,
      role: user.role
    };
    
    next();
  } catch (error) {
    console.error('Admin auth middleware hatası:', error);
    res.status(401).json({ message: 'Geçersiz token veya yetkilendirme hatası' });
  }
};

module.exports = adminAuth; 