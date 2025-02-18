const multer = require('multer');

// Dosyaları bellekte tut
const storage = multer.memoryStorage();

// Sadece resim dosyalarını kabul et
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Sadece resim dosyaları yüklenebilir.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 50MB
    files: 200 // Maksimum dosya sayısı
  }
});

module.exports = upload; 