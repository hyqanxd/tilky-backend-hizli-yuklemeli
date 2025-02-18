const adminAuth = async (req, res, next) => {
  try {
    // Kullanıcının rolünü kontrol et
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
      next();
    } else {
      res.status(403).json({ message: 'Bu işlem için admin yetkisi gerekiyor' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Yetkilendirme hatası' });
  }
};

module.exports = adminAuth; 