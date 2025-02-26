const mongoose = require('mongoose');

const giftHistorySchema = new mongoose.Schema({
  giftRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GiftRole',
    required: true
  },
  senderDiscordId: {
    type: String,
    required: true
  },
  recipientDiscordId: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  patreonTransactionId: {
    type: String,
    required: true
  },
  completedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indeksler
giftHistorySchema.index({ senderDiscordId: 1, createdAt: -1 });
giftHistorySchema.index({ recipientDiscordId: 1, createdAt: -1 });
giftHistorySchema.index({ patreonTransactionId: 1 }, { unique: true });

module.exports = mongoose.model('GiftHistory', giftHistorySchema); 