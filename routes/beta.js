const express = require('express');
const router = express.Router();
const BetaSignup = require('../models/BetaSignup');

// Beta başvurusu
router.post('/', async (req, res) => {
  try {
    // Daha önce başvuru yapılmış mı kontrol et
    const existingSignup = await BetaSignup.findOne({ email: req.body.email });
    if (existingSignup) {
      return res.status(400).json({ 
        message: 'Bu e-posta adresi ile daha önce başvuru yapılmış' 
      });
    }

    // Yeni başvuru oluştur
    const betaSignup = new BetaSignup({
      name: req.body.name,
      email: req.body.email,
      reason: req.body.reason,
      status: 'pending'
    });

    await betaSignup.save();

    res.status(201).json({
      message: 'Beta başvurunuz başarıyla alındı',
      betaSignup
    });
  } catch (error) {
    console.error('Beta başvuru hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

module.exports = router; 