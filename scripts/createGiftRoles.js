require('dotenv').config();
const mongoose = require('mongoose');
const GiftRole = require('../models/GiftRole');

const giftRoles = [
  {
    name: "Mini Destek Rolü",
    description: "Mini destekçilere özel Discord rolü ve ayrıcalıkları",
    price: 1.60,
    discordRoleId: "1344338991931195394", // Discord'dan Mini Destek rol ID'si
    imageUrl: "favorite", // FavoriteIcon
    patreonTierId: "25245184" // Patreon'da oluşturacağımız tier ID'si
  },
  {
    name: "Standart Destek Rolü",
    description: "Standart destekçilere özel Discord rolü ve genişletilmiş ayrıcalıklar",
    price: 3.20,
    discordRoleId: "1344339114396483604", // Discord'dan Standart Destek rol ID'si
    imageUrl: "star", // StarIcon
    patreonTierId: "25245193"
  },
  {
    name: "Premium Destek Rolü",
    description: "Premium destekçilere özel Discord rolü ve tüm özel ayrıcalıklar",
    price: 8,
    discordRoleId: "1344339184328114337", // Discord'dan Premium Destek rol ID'si
    imageUrl: "diamond", // DiamondIcon
    patreonTierId: "25245195"
  },
  {
    name: "Ultra Destek Rolü",
    description: "Ultra destekçilere özel Discord rolü, özel rozetler ve tüm premium ayrıcalıklar",
    price: 14.99,
    discordRoleId: "1344339279106539532", // Discord'dan Ultra Destek rol ID'si
    imageUrl: "speed", // SpeedIcon
    patreonTierId: "25245204"
  }
];

async function createGiftRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB\'ye bağlanıldı');

    // Mevcut rolleri temizle
    await GiftRole.deleteMany({});
    console.log('Eski roller temizlendi');

    // Yeni rolleri ekle
    const createdRoles = await GiftRole.insertMany(giftRoles);
    console.log('Yeni roller eklendi:', createdRoles);

    await mongoose.disconnect();
    console.log('MongoDB bağlantısı kapatıldı');
  } catch (error) {
    console.error('Hata:', error);
    process.exit(1);
  }
}

createGiftRoles(); 