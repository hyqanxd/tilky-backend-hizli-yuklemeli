const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  planTitle: {
    type: String,
    required: true
  },
  planType: {
    type: String,
    enum: ['tek seferlik', 'aylık'],
    required: true
  },
  orderId: {
    type: String,
    required: true,
    unique: true,
    sparse: true
  },
  paymentId: {
    type: String,
    unique: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Endeksler
donationSchema.index({ status: 1, createdAt: -1 });

const Donation = mongoose.model('Donation', donationSchema);

// Index senkronizasyonu
(async () => {
  try {
    await Donation.syncIndexes();
    console.log('Donation indeksleri senkronize edildi');
  } catch (error) {
    console.error('Index senkronizasyon hatası:', error);
  }
})();

module.exports = Donation; 