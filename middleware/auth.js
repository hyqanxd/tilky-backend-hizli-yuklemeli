const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
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

    // Son aktif zamanı güncelle
    user.lastActive = new Date();
    await user.save();
    
    // Kullanıcı bilgilerini req.user'a ekle
    req.user = {
      id: user._id,
      username: user.username,
      role: user.role
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware hatası:', error);
    res.status(401).json({ message: 'Geçersiz token' });
  }
}; 