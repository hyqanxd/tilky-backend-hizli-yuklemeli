const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const watchHistorySchema = new mongoose.Schema({
  anime: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Anime',
    required: true
  },
  episode: {
    seasonNumber: {
      type: Number,
      required: true
    },
    episodeNumber: {
      type: Number,
      required: true
    },
    watchedAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  }
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  discordId: {
    type: String,
    sparse: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  profileImage: {
    type: String,
    default: 'https://backend.anitilky.xyz/uploads/avatars/default-avatar.webp'
  },
  profileMusic: {
    type: String,
    default: null
  },
  bannerImage: {
    type: String,
    default: 'https://backend.anitilky.xyz/uploads/banners/default-banner.webp'
  },
  role: {
    type: String,
    enum: ['user', 'beta', 'admin', 'superadmin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'blocked'],
    default: 'active'
  },
  watchList: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Anime'
  }],
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Anime'
  }],
  mangaWatchList: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manga'
  }],
  mangaFavorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manga'
  }],
  watchHistory: [watchHistorySchema],
  notifications: [{
    message: String,
    title: String,
    type: {
      type: String,
      enum: ['info', 'warning', 'error', 'success', 'system'],
      default: 'info'
    },
    read: { 
      type: Boolean, 
      default: false 
    },
    createdAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  preferences: {
    emailNotifications: {
      newEpisodes: {
        type: Boolean,
        default: true
      },
      watchListUpdates: {
        type: Boolean,
        default: true
      },
      systemAnnouncements: {
        type: Boolean,
        default: true
      }
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'dark'
    },
    language: {
      type: String,
      enum: ['tr', 'en', 'jp'],
      default: 'tr'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  bio: {
    type: String,
    default: '',
    maxLength: 500
  },
  badge: {
    type: String,
    enum: ['admin', 'fansub', 'uploader', 'beta', 'vip', 'none'],
    default: 'none'
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followerCount: {
    type: Number,
    default: 0
  },
  followingCount: {
    type: Number,
    default: 0
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// İzleme listesine anime ekleme/çıkarma metodu
userSchema.methods.toggleWatchList = async function(animeId) {
  const index = this.watchList.indexOf(animeId);
  if (index > -1) {
    this.watchList.splice(index, 1);
  } else {
    this.watchList.push(animeId);
  }
  await this.save();
  return this.watchList;
};

// Favorilere anime ekleme/çıkarma metodu
userSchema.methods.toggleFavorites = async function(animeId) {
  const index = this.favorites.indexOf(animeId);
  if (index > -1) {
    this.favorites.splice(index, 1);
  } else {
    this.favorites.push(animeId);
  }
  await this.save();
  return this.favorites;
};

// İzleme geçmişine kayıt ekleme metodu
userSchema.methods.addToWatchHistory = async function(animeId, seasonNumber, episodeNumber, progress = 0) {
  const existingEntry = this.watchHistory.find(
    entry => 
      entry.anime.toString() === animeId.toString() &&
      entry.episode.seasonNumber === seasonNumber &&
      entry.episode.episodeNumber === episodeNumber
  );

  if (existingEntry) {
    existingEntry.episode.progress = progress;
    existingEntry.episode.watchedAt = new Date();
  } else {
    this.watchHistory.push({
      anime: animeId,
      episode: {
        seasonNumber,
        episodeNumber,
        progress
      }
    });
  }

  await this.save();
  return this.watchHistory;
};

// Bildirim ekleme metodu
userSchema.methods.addNotification = async function(message, type = 'info') {
  this.notifications.unshift({
    message,
    type,
    read: false
  });

  if (this.notifications.length > 50) {
    this.notifications = this.notifications.slice(0, 50);
  }

  await this.save();
  return this.notifications;
};

// Takip etme/takipten çıkma metodu
userSchema.methods.toggleFollow = async function(targetUserId) {
  const targetUser = await this.model('User').findById(targetUserId);
  if (!targetUser) {
    throw new Error('Kullanıcı bulunamadı');
  }

  const isFollowing = this.following.includes(targetUserId);
  
  if (isFollowing) {
    // Takipten çık
    this.following = this.following.filter(id => id.toString() !== targetUserId.toString());
    this.followingCount = this.following.length;
    
    targetUser.followers = targetUser.followers.filter(id => id.toString() !== this._id.toString());
    targetUser.followerCount = targetUser.followers.length;
  } else {
    // Takip et
    this.following.push(targetUserId);
    this.followingCount = this.following.length;
    
    targetUser.followers.push(this._id);
    targetUser.followerCount = targetUser.followers.length;
  }

  await Promise.all([this.save(), targetUser.save()]);
  return { isFollowing: !isFollowing };
};

module.exports = mongoose.model('User', userSchema); 