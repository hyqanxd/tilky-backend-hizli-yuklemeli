const mongoose = require('mongoose');

const giftRoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  discordRoleId: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  patreonTierId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GiftRole', giftRoleSchema); 