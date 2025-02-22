const mongoose = require('mongoose');

const videoSourceSchema = new mongoose.Schema({
  url: {
    type: String,
    default: ''
  },
  quality: {
    type: String,
    enum: ['360p', '480p', '720p', '1080p', '4K'],
    default: '720p'
  },
  language: {
    type: String,
    enum: ['TR', 'JP', 'EN'],
    default: 'TR'
  },
  type: {
    type: String,
    enum: ['Altyazılı', 'Dublaj'],
    default: 'Altyazılı'
  },
  fansub: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fansub'
  },
  sourceId: {
    type: String,
    default: function() {
      return `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }
});

const episodeSchema = new mongoose.Schema({
  episodeNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  thumbnail: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    default: 0
  },
  videoSources: [videoSourceSchema],
  releaseDate: {
    type: Date,
    default: Date.now
  }
});

const seasonSchema = new mongoose.Schema({
  seasonNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  episodes: [episodeSchema]
});

const animeSchema = new mongoose.Schema({
  title: {
    romaji: {
      type: String,
      required: true
    },
    english: {
      type: String,
      default: ''
    },
    native: {
      type: String,
      default: ''
    }
  },
  uploader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  originalTitle: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  coverImage: {
    type: String,
    required: true
  },
  bannerImage: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['TV', 'Movie', 'OVA', 'ONA', 'Special'],
    default: 'TV'
  },
  status: {
    type: String,
    enum: ['ongoing', 'completed', 'upcoming'],
    default: 'ongoing'
  },
  releaseDate: {
    type: Date,
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  genres: [{
    type: String
  }],
  source: {
    name: {
      type: String,
      enum: ['AniList', 'MyAnimeList', 'TMDB', 'Manual', 'Custom'],
      required: true
    },
    id: {
      type: String,
      required: true
    }
  },
  seasons: [seasonSchema]
}, {
  timestamps: true
});

// Sadece source için benzersiz indeks
animeSchema.index({ 'source.id': 1, 'source.name': 1 }, { unique: true });

module.exports = mongoose.model('Anime', animeSchema); 