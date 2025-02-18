const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema({
  chapterNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  pages: [{
    type: String,
    required: true
  }],
  uploadDate: {
    type: Date,
    default: Date.now
  }
});

const mangaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  alternativeTitles: {
    english: String,
    japanese: String,
    romaji: String
  },
  description: {
    type: String,
    required: true
  },
  coverImage: {
    type: String,
    required: true
  },
  bannerImage: {
    type: String
  },
  status: {
    type: String,
    enum: ['Devam Ediyor', 'Tamamlandı', 'Bırakıldı', 'completed', 'ongoing', 'dropped'],
    default: 'Devam Ediyor'
  },
  type: {
    type: String,
    enum: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'manga', 'manhwa', 'manhua', 'novel'],
    required: true
  },
  genres: [{
    type: String,
    required: true
  }],
  tags: [{
    type: String
  }],
  author: {
    type: String,
    required: true
  },
  artist: {
    type: String
  },
  releaseYear: {
    type: Number
  },
  chapters: [chapterSchema],
  rating: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  anilistId: {
    type: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Güncelleme tarihini otomatik olarak ayarla
mangaSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Manga', mangaSchema); 