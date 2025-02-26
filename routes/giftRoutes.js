const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const GiftRole = require('../models/GiftRole');
const GiftHistory = require('../models/GiftHistory');
const User = require('../models/User');
const Gift = require('../models/Gift');
const { createPatreonPayment, verifyPatreonPayment, getAccessToken } = require('../services/patreonService');
const { assignDiscordRole, grantGenerousRole, getDiscordUserInfo, sendGiftNotification } = require('../services/discordService');
const Donation = require('../models/Donation');

// Mevcut hediye rollerini listele
router.get('/roles', async (req, res) => {
  try {
    const roles = await GiftRole.find();
    res.json(roles);
  } catch (error) {
    console.error('Roller getirme hatası:', error);
    res.status(500).json({ message: 'Roller getirilirken bir hata oluştu' });
  }
});

// Hediye rol satın alma işlemi başlat
router.post('/purchase', auth, async (req, res) => {
  try {
    console.log('Purchase request body:', req.body);

    const { roleId, recipientDiscordId, senderDiscordId } = req.body;
    
    if (!roleId || !recipientDiscordId || !senderDiscordId) {
      return res.status(400).json({ 
        message: 'Eksik parametreler',
        required: { 
          roleId: !!roleId, 
          recipientDiscordId: !!recipientDiscordId,
          senderDiscordId: !!senderDiscordId
        }
      });
    }

    // Kendine hediye vermeyi engelle
    if (recipientDiscordId === senderDiscordId) {
      return res.status(400).json({ 
        message: 'Kendinize hediye veremezsiniz'
      });
    }

    // Rol kontrolü
    const role = await GiftRole.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Rol bulunamadı', roleId });
    }

    // Discord ID formatını kontrol et
    if (!/^\d{17,19}$/.test(recipientDiscordId)) {
      return res.status(400).json({ message: 'Geçersiz alıcı Discord ID formatı' });
    }
    if (!/^\d{17,19}$/.test(senderDiscordId)) {
      return res.status(400).json({ message: 'Geçersiz gönderen Discord ID formatı' });
    }

    try {
      // Patreon ödeme oturumu oluştur
      const session = await createPatreonPayment({
        amount: role.price,
        description: `${role.name} Rol Hediyesi`,
        metadata: {
          roleId,
          recipientDiscordId,
          senderDiscordId
        }
      });

      console.log('Created Patreon session:', {
        id: session.id,
        state: session.state,
        amount: session.amount
      });

      // Gift History oluştur
      const giftHistory = new GiftHistory({
        giftRole: role._id,
        senderDiscordId,
        recipientDiscordId,
        price: role.price,
        patreonTransactionId: session.state,
        status: 'pending'
      });

      await giftHistory.save();

      res.json({
        sessionId: session.state,
        paymentUrl: session.url,
        giftHistoryId: giftHistory._id
      });

    } catch (error) {
      console.error('Hediye işlemi hatası:', error);
      return res.status(500).json({ 
        message: 'İşlem başlatılırken bir hata oluştu',
        error: error.message 
      });
    }
  } catch (error) {
    console.error('Hediye rol satın alma hatası:', error);
    res.status(500).json({ 
      message: 'İşlem başlatılırken bir hata oluştu',
      error: error.message 
    });
  }
});

// Ödeme webhook'u
router.post('/webhook', async (req, res) => {
  try {
    const { sessionId, status } = req.body;

    const giftHistory = await GiftHistory.findOne({ patreonTransactionId: sessionId });
    if (!giftHistory) {
      return res.status(404).json({ message: 'Hediye geçmişi bulunamadı' });
    }

    // Ödeme doğrulama
    const isValid = await verifyPatreonPayment(sessionId);
    if (!isValid) {
      giftHistory.status = 'failed';
      await giftHistory.save();
      return res.status(400).json({ message: 'Ödeme doğrulanamadı' });
    }

    // Discord rollerini ata
    const role = await GiftRole.findById(giftHistory.giftRole);
    await assignDiscordRole(giftHistory.recipientDiscordId, role.discordRoleId);
    
    // Hediye eden kullanıcıya cömert rozeti ver
    await assignDiscordRole(giftHistory.senderDiscordId, process.env.DISCORD_GENEROUS_ROLE_ID);

    giftHistory.status = 'completed';
    await giftHistory.save();

    res.json({ message: 'İşlem başarıyla tamamlandı' });
  } catch (error) {
    console.error('Webhook işleme hatası:', error);
    res.status(500).json({ message: 'Webhook işlenirken bir hata oluştu' });
  }
});

// Kullanıcının hediye geçmişini getir
router.get('/history', auth, async (req, res) => {
  try {
    // Kullanıcının Discord ID'sini al
    const discordId = req.user.discordId;
    if (!discordId) {
      return res.status(400).json({ message: 'Discord hesabınız bağlı değil' });
    }

    const history = await GiftHistory.find({
      $or: [
        { senderDiscordId: discordId },
        { recipientDiscordId: discordId }
      ]
    })
    .populate('giftRole')
    .sort({ createdAt: -1 });

    // Her kayıt için Discord kullanıcı bilgilerini al
    const enrichedHistory = await Promise.all(history.map(async (record) => {
      const [sender, recipient] = await Promise.all([
        getDiscordUserInfo(record.senderDiscordId),
        getDiscordUserInfo(record.recipientDiscordId)
      ]);

      return {
        ...record.toObject(),
        sender: sender || { 
          id: record.senderDiscordId,
          username: 'Bilinmeyen Kullanıcı',
          displayName: 'Bilinmeyen Kullanıcı'
        },
        recipient: recipient || {
          id: record.recipientDiscordId,
          username: 'Bilinmeyen Kullanıcı',
          displayName: 'Bilinmeyen Kullanıcı'
        }
      };
    }));
    
    res.json(enrichedHistory);
  } catch (error) {
    console.error('Geçmiş getirme hatası:', error);
    res.status(500).json({ message: 'Geçmiş getirilirken bir hata oluştu' });
  }
});

// Patreon callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    console.log('Callback alındı:', { state });

    if (!code) {
      console.error('Yetkilendirme kodu eksik');
      return res.redirect('/donation/error?reason=no_code');
    }

    // Gift History'yi bul
    const giftHistory = await GiftHistory.findOne({ 
      patreonTransactionId: state,
      status: 'pending'
    }).populate('giftRole');

    if (!giftHistory) {
      console.error('Bekleyen hediye bulunamadı:', state);
      return res.redirect('/donation/error?reason=no_pending_gift');
    }

    try {
      // Patreon token al
      const accessToken = await getAccessToken(code);
      if (!accessToken) {
        console.error('Access token alınamadı');
        giftHistory.status = 'failed';
        await giftHistory.save();
        return res.redirect('/donation/error?reason=token_error');
      }

      // Ödemeyi doğrula
      const isValid = await verifyPatreonPayment(accessToken);
      if (!isValid) {
        console.error('Kimlik doğrulama başarısız');
        giftHistory.status = 'failed';
        await giftHistory.save();
        return res.redirect('/donation/error?reason=invalid_payment');
      }

      try {
        // Discord kullanıcı bilgilerini al
        const [sender, recipient] = await Promise.all([
          getDiscordUserInfo(giftHistory.senderDiscordId),
          getDiscordUserInfo(giftHistory.recipientDiscordId)
        ]);

        // Alıcıya rolü ver
        await assignDiscordRole(giftHistory.recipientDiscordId, giftHistory.giftRole.discordRoleId);
        console.log('Hediye rolü verildi:', {
          userId: giftHistory.recipientDiscordId,
          roleId: giftHistory.giftRole.discordRoleId
        });

        // Gönderene cömert rolü ver
        await assignDiscordRole(giftHistory.senderDiscordId, process.env.DISCORD_GENEROUS_ROLE_ID);
        console.log('Cömert rolü verildi:', {
          userId: giftHistory.senderDiscordId,
          roleId: process.env.DISCORD_GENEROUS_ROLE_ID
        });

        // Discord bildirimi gönder
        await sendGiftNotification(sender, recipient, giftHistory.giftRole);

        // Gift History'yi güncelle
        giftHistory.status = 'completed';
        giftHistory.completedAt = new Date();
        await giftHistory.save();

        console.log('Gift History güncellendi:', {
          id: giftHistory._id,
          status: giftHistory.status,
          completedAt: giftHistory.completedAt
        });

        return res.redirect('/donation/success');
      } catch (roleError) {
        console.error('Discord rol atama hatası:', roleError);
        giftHistory.status = 'failed';
        await giftHistory.save();
        return res.redirect('/donation/error?reason=role_assignment_error');
      }
    } catch (tokenError) {
      console.error('Token işleme hatası:', tokenError);
      giftHistory.status = 'failed';
      await giftHistory.save();
      return res.redirect('/donation/error?reason=token_error');
    }
  } catch (error) {
    console.error('Callback genel hatası:', error);
    return res.redirect('/donation/error?reason=general_error');
  }
});

// Son bağışları getir
router.get('/recent', async (req, res) => {
  try {
    const recentGifts = await GiftHistory.find()
      .populate('giftRole')
      .sort({ createdAt: -1 })
      .limit(10);

    // Her kayıt için Discord kullanıcı bilgilerini al
    const enrichedGifts = await Promise.all(recentGifts.map(async (record) => {
      const [sender, recipient] = await Promise.all([
        getDiscordUserInfo(record.senderDiscordId),
        getDiscordUserInfo(record.recipientDiscordId)
      ]);

      return {
        ...record.toObject(),
        sender: sender || { 
          id: record.senderDiscordId,
          username: 'Bilinmeyen Kullanıcı',
          displayName: 'Bilinmeyen Kullanıcı'
        },
        recipient: recipient || {
          id: record.recipientDiscordId,
          username: 'Bilinmeyen Kullanıcı',
          displayName: 'Bilinmeyen Kullanıcı'
        }
      };
    }));
    
    res.json(enrichedGifts);
  } catch (error) {
    console.error('Son bağışlar getirme hatası:', error);
    res.status(500).json({ message: 'Son bağışlar getirilirken bir hata oluştu' });
  }
});

module.exports = router; 