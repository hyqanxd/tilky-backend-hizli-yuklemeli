const jwt = require('jsonwebtoken');
const User = require('../models/User');

const admin = async (req, res, next) => {
  try {
    // Kullanıcının admin olup olmadığını kontrol et
    if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Bu işlem için admin yetkisi gerekli' });
    }
    next();
  } catch (error) {
    res.status(401).json({ message: 'Yetkilendirme hatası' });
  }
};

module.exports = admin; 