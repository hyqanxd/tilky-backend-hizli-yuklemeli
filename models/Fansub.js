const mongoose = require('mongoose');

const fansubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: ''
  },
  logo: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  socialMedia: {
    discord: { type: String, default: '' },
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  members: [{
    username: { type: String, required: true },
    role: { 
      type: String, 
      enum: ['admin', 'translator', 'editor', 'timer', 'encoder', 'qc'],
      required: true 
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Fansub', fansubSchema); 