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
    unique: true
  },
  paymentId: {
    type: String,
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
donationSchema.index({ orderId: 1 });
donationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Donation', donationSchema); 