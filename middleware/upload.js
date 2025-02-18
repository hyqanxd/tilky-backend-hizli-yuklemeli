const multer = require('multer');

// Dosyaları bellekte tut
const storage = multer.memoryStorage();

// Resim ve ZIP dosyalarını kabul et
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || 
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream') {
    cb(null, true);
  } else {
    cb(new Error('Sadece resim ve ZIP dosyaları yüklenebilir.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB
    files: 10000 // Maksimum dosya sayısı
  }
});

module.exports = upload; 