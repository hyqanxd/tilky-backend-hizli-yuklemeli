const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Donation = require('../models/Donation');
const auth = require('../middleware/auth');

// Shopier API bilgileri
const SHOPIER_API_KEY = process.env.SHOPIER_API_KEY;
const SHOPIER_API_SECRET = process.env.SHOPIER_API_SECRET;

// Bağış planları
const DONATION_PLANS = {
  'Mini Destek': {
    price: 49.99,
    productId: 'mini_destek'
  },
  'Standart Destek': {
    price: 99.99,
    productId: 'standart_destek'
  },
  'Premium Destek': {
    price: 249.99,
    productId: 'premium_destek'
  },
  'Aylık Destek': {
    price: 149.99,
    productId: 'aylik_destek'
  }
};

// Debug için log middleware'i
router.use((req, res, next) => {
  if (req.path === '/webhook') {
    return next();
  }
  console.log(`[Donation Route] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Donation route is working' });
});

// Shopier için ödeme oluştur
router.post('/create-session', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user;

    if (!plan || !plan.title || !plan.price) {
      return res.status(400).json({ message: 'Geçersiz plan bilgisi' });
    }

    // Sipariş numarası oluştur
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Shopier için gerekli parametreler
    const params = {
      API_key: SHOPIER_API_KEY,
      website_index: 1,
      platform_order_id: orderId,
      product_name: plan.title,
      product_type: 1, // Dijital ürün
      buyer_name: user.username,
      buyer_email: user.email || 'user@example.com',
      buyer_phone: '5555555555',
      prices_currency: 'TRY',
      currency: 'TRY',
      amount: plan.price,
      language: 'TR',
      callback_url: `${process.env.CLIENT_URL}/donation-success`,
      callback_fail_url: `${process.env.CLIENT_URL}/donation`,
    };

    // Shopier hash oluştur
    const hashStr = `${SHOPIER_API_SECRET}${params.API_key}${params.website_index}${params.platform_order_id}${params.amount}${params.currency}${params.callback_url}`;
    const hash = crypto.createHash('sha256').update(hashStr).digest('base64');

    // Bağış kaydını oluştur
    const donation = await Donation.create({
      userId: user.id,
      username: user.username,
      amount: parseFloat(plan.price),
      planTitle: plan.title,
      planType: plan.period,
      orderId: orderId,
      status: 'pending'
    });

    // Shopier form verilerini döndür
    res.json({
      shopierParams: {
        ...params,
        signature: hash,
        paymentUrl: 'https://www.shopier.com/ShowProduct/api_pay4.php'
      },
      donation: donation
    });

  } catch (error) {
    console.error('Ödeme oluşturma hatası:', error);
    res.status(500).json({ 
      message: 'Ödeme oluşturulurken bir hata oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Shopier callback
router.post('/callback', express.json(), async (req, res) => {
  try {
    const { platform_order_id, status, payment_id } = req.body;

    console.log('Shopier callback:', req.body);

    if (status === 'success') {
      // Bağışı güncelle
      const donation = await Donation.findOneAndUpdate(
        { orderId: platform_order_id },
        { 
          status: 'completed',
          paymentId: payment_id
        },
        { new: true }
      );

      console.log('Bağış tamamlandı:', donation);
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Callback hatası:', error);
    res.status(500).json({ error: 'Callback işlemi başarısız' });
  }
});

// Bağış listesini getir
router.get('/list', async (req, res) => {
  try {
    console.log('Bağışlar getiriliyor...');
    
    const donations = await Donation.find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('username userId planTitle createdAt amount')
      .lean();
    
    console.log('Tamamlanan bağışlar:', donations);
    res.json(donations);
  } catch (error) {
    console.error('Bağış listesi hatası:', error);
    res.status(500).json({ message: 'Bağış listesi alınırken bir hata oluştu.' });
  }
});

module.exports = router; 