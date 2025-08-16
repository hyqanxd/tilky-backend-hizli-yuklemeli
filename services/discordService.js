// Discord servisleri geçici olarak devre dışı bırakıldı
// const { Client, GatewayIntentBits } = require('discord.js');
// const User = require('../models/User');

// const client = new Client({
//   intents: [
//     GatewayIntentBits.Guilds,
//     GatewayIntentBits.GuildMembers,
//     GatewayIntentBits.GuildPresences,
//     GatewayIntentBits.MessageContent
//   ]
// });

// const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
// const GUILD_ID = process.env.DISCORD_GUILD_ID;
// const GENEROUS_ROLE_ID = process.env.DISCORD_GENEROUS_ROLE_ID;
// const GIFT_NOTIFICATIONS_CHANNEL_ID = process.env.DISCORD_GIFT_NOTIFICATIONS_CHANNEL_ID;

// client.login(DISCORD_TOKEN);

// Discord kullanıcı bilgilerini getir
const getDiscordUserInfo = async (userId) => {
  try {
    console.log('Discord servisi devre dışı - getDiscordUserInfo çağrıldı:', userId);
    // Discord servisi devre dışı olduğu için varsayılan bilgi döndür
    return {
      id: userId,
      username: 'Discord Bağlantısı Yok',
      displayName: 'Discord Bağlantısı Yok',
      avatar: null
    };
  } catch (error) {
    console.error('Discord kullanıcı bilgisi getirme hatası:', error);
    return {
      id: userId,
      username: 'Discord Bağlantısı Yok',
      displayName: 'Discord Bağlantısı Yok',
      avatar: null
    };
  }
};

// Discord rolü ata
const assignDiscordRole = async (userId, roleId) => {
  try {
    console.log('Discord servisi devre dışı - assignDiscordRole çağrıldı:', { userId, roleId });
    // Discord servisi devre dışı olduğu için başarılı olarak işaretle
    console.log('Discord rol atama simüle edildi:', { userId, roleId });
    return true;
  } catch (error) {
    console.error('Discord rol atama hatası:', error);
    // Hata durumunda da başarılı olarak işaretle (Discord bağlantısı olmadığı için)
    return true;
  }
};

// Cömert rozeti ver
const grantGenerousRole = async (userId) => {
  try {
    console.log('Discord servisi devre dışı - grantGenerousRole çağrıldı:', userId);
    // Discord servisi devre dışı olduğu için başarılı olarak işaretle
    console.log('Cömert rozeti simüle edildi:', userId);
    return true;
  } catch (error) {
    console.error('grantGenerousRole error:', error);
    // Hata durumunda da başarılı olarak işaretle (Discord bağlantısı olmadığı için)
    return true;
  }
};

// Hediye bildirimini Discord kanalına gönder
const sendGiftNotification = async (sender, recipient, role) => {
  try {
    console.log('Discord servisi devre dışı - sendGiftNotification çağrıldı:', { 
      sender: sender?.displayName, 
      recipient: recipient?.displayName, 
      role: role?.name 
    });
    // Discord servisi devre dışı olduğu için bildirim gönderilmedi
    console.log('Discord bildirimi simüle edildi');
    return true;
  } catch (error) {
    console.error('Discord bildirim gönderme hatası:', error);
    // Hata durumunda da başarılı olarak işaretle (Discord bağlantısı olmadığı için)
    return true;
  }
};

module.exports = {
  assignDiscordRole,
  grantGenerousRole,
  getDiscordUserInfo,
  sendGiftNotification
}; 