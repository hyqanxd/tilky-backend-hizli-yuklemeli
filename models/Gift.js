const mongoose = require('mongoose');

const giftSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true
  },
  roleId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  patreonTransactionId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indeksler
giftSchema.index({ discordId: 1 });
giftSchema.index({ patreonTransactionId: 1 }, { unique: true });
giftSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Gift', giftSchema); 