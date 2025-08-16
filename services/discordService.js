/*const { Client, GatewayIntentBits } = require('discord.js');
const User = require('../models/User');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const GENEROUS_ROLE_ID = process.env.DISCORD_GENEROUS_ROLE_ID;
const GIFT_NOTIFICATIONS_CHANNEL_ID = process.env.DISCORD_GIFT_NOTIFICATIONS_CHANNEL_ID;

client.login(DISCORD_TOKEN);

// Discord kullanıcı bilgilerini getir
const getDiscordUserInfo = async (userId) => {
  try {
    if (!userId) {
      throw new Error('Discord ID gerekli');
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);

    if (!member) {
      return null;
    }

    return {
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.displayAvatarURL({ dynamic: true })
    };
  } catch (error) {
    console.error('Discord kullanıcı bilgisi getirme hatası:', error);
    return null;
  }
};

// Discord rolü ata
const assignDiscordRole = async (userId, roleId) => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    
    if (!member) {
      throw new Error('Kullanıcı sunucuda bulunamadı');
    }

    await member.roles.add(roleId);
    return true;
  } catch (error) {
    console.error('Discord rol atama hatası:', error);
    throw new Error('Rol atanamadı');
  }
};

// Cömert rozeti ver
const grantGenerousRole = async (userId) => {
  try {
    if (!userId) {
      console.error('grantGenerousRole: UserId is missing');
      throw new Error('UserId is required');
    }

    console.log('Attempting to grant generous role to user:', userId);

    const user = await User.findById(userId);
    if (!user) {
      console.error('grantGenerousRole: User not found:', userId);
      throw new Error('Kullanıcı bulunamadı');
    }

    if (!user.discordId) {
      console.error('grantGenerousRole: Discord ID missing for user:', userId);
      throw new Error('Discord ID bulunamadı');
    }

    console.log('Found user:', {
      userId: user._id,
      username: user.username,
      discordId: user.discordId
    });

    // Discord rolünü ata
    try {
      await assignDiscordRole(user.discordId, GENEROUS_ROLE_ID);
      console.log('Successfully assigned Discord role to:', user.discordId);
    } catch (discordError) {
      console.error('Discord role assignment failed:', discordError);
      throw new Error('Discord rolü atanamadı: ' + discordError.message);
    }
    
    // Kullanıcı veritabanını güncelle
    user.badges = user.badges || [];
    if (!user.badges.includes('generous')) {
      user.badges.push('generous');
      await user.save();
      console.log('Added generous badge to user:', user._id);
    } else {
      console.log('User already has generous badge:', user._id);
    }

    return true;
  } catch (error) {
    console.error('grantGenerousRole error:', {
      error: error.message,
      userId,
      stack: error.stack
    });
    throw new Error('Rozet verilemedi: ' + error.message);
  }
};

// Hediye bildirimini Discord kanalına gönder
const sendGiftNotification = async (sender, recipient, role) => {
  try {
    const channel = await client.channels.fetch(GIFT_NOTIFICATIONS_CHANNEL_ID);
    if (!channel) {
      throw new Error('Bildirim kanalı bulunamadı');
    }

    const embed = {
      color: 0xFF0000,
      title: '🎁 Yeni Bir Hediye Rolü!',
      description: `**${sender.displayName}** kullanıcısı **${recipient.displayName}** kullanıcısına **${role.name}** rolünü hediye etti!`,
      fields: [
        {
          name: '🎭 Hediye Edilen Rol',
          value: role.name,
          inline: true
        },
        {
          name: '💝 Hediye Eden',
          value: sender.displayName,
          inline: true
        },
        {
          name: '🎯 Hediye Alan',
          value: recipient.displayName,
          inline: true
        }
      ],
      timestamp: new Date(),
      footer: {
        text: 'Anitilky Hediye Sistemi'
      }
    };

    await channel.send({ embeds: [embed] });

    // Teşekkür mesajı
    const thankMessage = `Hey <@${recipient.id}>, <@${sender.id}> sana **${role.name}** rolünü hediye etti! Teşekkür etmeyi unutma 💝`;
    await channel.send(thankMessage);

  } catch (error) {
    console.error('Discord bildirim gönderme hatası:', error);
  }
};

module.exports = {
  assignDiscordRole,
  grantGenerousRole,
  getDiscordUserInfo,
  sendGiftNotification
}; */