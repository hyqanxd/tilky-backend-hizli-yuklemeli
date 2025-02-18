require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB bağlantısı başarılı');

    // Şifreyi hashleme
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('adminşifresi24', salt);

    // Süper admin kullanıcısını oluşturma
    const superAdmin = new User({
      username: 'hakanxd',
      email: 'imhyqan@gmail.com',
      password: hashedPassword,
      role: 'superadmin',
      badge: 'admin',
      bio: 'AniTilky Süper Admin',
      status: 'active'
    });

    // Kullanıcıyı kaydetme
    await superAdmin.save();
    console.log('Süper admin başarıyla oluşturuldu');

    mongoose.connection.close();
  } catch (error) {
    console.error('Hata:', error);
    process.exit(1);
  }
};

createSuperAdmin(); 