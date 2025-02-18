const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Post = require('../models/Post');
const multer = require('multer');
const { uploadToBunnyStorage } = require('../utils/bunnyStorage');
const fs = require('fs');
const path = require('path');

// Multer ayarları
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join('/tmp', 'uploads', 'posts');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  },
  fileFilter: function (req, file, cb) {
    console.log('Yüklenen dosya tipi:', file.mimetype);
    console.log('Dosya adı:', file.originalname);

    const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|webp/;
    const allowedMimeTypes = /^(image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|webm))$/;

    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimeTypes.test(file.mimetype);

    console.log('Uzantı kontrolü:', extname);
    console.log('MIME tipi kontrolü:', mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error(`Desteklenmeyen dosya tipi. Kabul edilen formatlar: JPEG, JPG, PNG, GIF, WEBP, MP4, WEBM. Yüklenen dosya: ${file.mimetype}`));
    }
  }
}).single('media');

// Gönderi oluşturma
router.post('/', auth, async (req, res) => {
  upload(req, res, async function(err) {
    console.log('Upload callback başladı');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    if (err instanceof multer.MulterError) {
      console.error('Multer hatası:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          message: 'Dosya boyutu çok büyük! Maksimum 500MB yükleyebilirsiniz.' 
        });
      }
      return res.status(400).json({ message: err.message });
    } else if (err) {
      console.error('Upload hatası:', err);
      return res.status(400).json({ message: err.message });
    }

    try {
      const { content } = req.body;
      console.log('Gelen içerik:', content);
      console.log('Gelen dosya:', req.file);

      // En az bir içerik veya medya olmalı
      if (!content && !req.file) {
        return res.status(400).json({
          message: 'Gönderi için içerik veya medya gereklidir'
        });
      }

      const post = new Post({
        userId: req.user.id,
        content: content || '',
        mediaType: req.file ? (req.file.mimetype.startsWith('video/') ? 'video' : 'image') : null
      });

      if (req.file) {
        try {
          const fileName = `posts/${Date.now()}-${path.basename(req.file.originalname)}`;
          console.log('Dosya yükleniyor:', fileName);
          const uploadResult = await uploadToBunnyStorage(req.file.path, fileName);
          console.log('Dosya yüklendi:', uploadResult);
          
          // Geçici dosyayı temizle
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }

          post.mediaUrl = uploadResult.url;
        } catch (uploadError) {
          console.error('Medya yükleme hatası:', uploadError);
          // Geçici dosyayı temizle
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ 
            message: 'Medya yüklenirken bir hata oluştu',
            error: uploadError.message 
          });
        }
      }

      await post.save();
      console.log('Gönderi kaydedildi:', post);
      
      const populatedPost = await Post.findById(post._id)
        .populate({
          path: 'userId',
          select: 'username profileImage role'
        })
        .populate({
          path: 'comments.userId',
          select: 'username profileImage'
        });

      res.status(201).json(populatedPost);
    } catch (error) {
      console.error('Gönderi oluşturma hatası:', error);
      // Geçici dosyayı temizle
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ 
        message: 'Gönderi oluşturulurken bir hata oluştu',
        error: error.message 
      });
    }
  });
});

// Kullanıcının gönderilerini getirme
router.get('/user/:userId', async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.userId })
      .populate({
        path: 'userId',
        select: 'username profileImage role'
      })
      .populate({
        path: 'comments.userId',
        select: 'username profileImage'
      })
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    console.error('Gönderiler getirilirken hata:', error);
    res.status(500).json({ message: 'Gönderiler getirilirken bir hata oluştu' });
  }
});

// Gönderi silme
router.delete('/:postId', auth, async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.postId, userId: req.user.id });
    if (!post) {
      return res.status(404).json({ message: 'Gönderi bulunamadı' });
    }

    // Medya dosyasını Bunny Storage'dan sil
    if (post.mediaUrl) {
      // Bunny Storage silme işlemi burada yapılacak
    }

    await post.remove();
    res.json({ message: 'Gönderi başarıyla silindi' });
  } catch (error) {
    console.error('Gönderi silme hatası:', error);
    res.status(500).json({ message: 'Gönderi silinirken bir hata oluştu' });
  }
});

// Yorum silme endpoint'i
router.delete('/:postId/comments/:commentId', auth, async (req, res) => {
  try {
    console.log('Debug - Auth User ID:', req.user.id);
    
    const post = await Post.findById(req.params.postId)
      .populate('userId', 'username profileImage')
      .populate({
        path: 'comments.userId',
        select: 'username profileImage'
      });

    if (!post) {
      return res.status(404).json({ message: 'Gönderi bulunamadı' });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Yorum bulunamadı' });
    }

    console.log('Debug - Yetkilendirme Kontrolü:', {
      commentUserId: comment.userId._id.toString(),
      postUserId: post.userId._id.toString(),
      requestUserId: req.user.id,
      isCommentOwner: comment.userId._id.toString() === req.user.id.toString(),
      isPostOwner: post.userId._id.toString() === req.user.id.toString()
    });

    // Yorum sahibi veya gönderi sahibi ise silme işlemine izin ver
    if (comment.userId._id.toString() === req.user.id.toString() || post.userId._id.toString() === req.user.id.toString()) {
      comment.remove();
      await post.save();
      
      // Populate işlemini tekrar yap
      await post.populate({
        path: 'comments.userId',
        select: 'username profileImage'
      });
      
      console.log('Debug - Yorum başarıyla silindi');
      res.json(post);
    } else {
      console.log('Debug - Yetkilendirme Reddedildi');
      return res.status(403).json({ message: 'Bu yorumu silme yetkiniz yok' });
    }
  } catch (error) {
    console.error('Yorum silme hatası:', error);
    res.status(500).json({ message: 'Yorum silinirken bir hata oluştu' });
  }
});

// Gönderiyi beğenme/beğenmekten vazgeçme
router.post('/:postId/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Gönderi bulunamadı' });
    }

    const likeIndex = post.likes.indexOf(req.user.id);
    if (likeIndex > -1) {
      post.likes.splice(likeIndex, 1);
    } else {
      post.likes.push(req.user.id);
    }

    await post.save();
    await post.populate('userId', 'username profileImage');
    res.json(post);
  } catch (error) {
    console.error('Beğeni hatası:', error);
    res.status(500).json({ message: 'Beğeni işlemi sırasında bir hata oluştu' });
  }
});

// Gönderiye yorum yapma
router.post('/:postId/comment', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Gönderi bulunamadı' });
    }

    post.comments.push({
      userId: req.user.id,
      content: req.body.content,
      createdAt: new Date()
    });

    await post.save();
    await post.populate({
      path: 'comments.userId',
      select: 'username profileImage'
    });
    await post.populate('userId', 'username profileImage');
    res.json(post);
  } catch (error) {
    console.error('Yorum yapma hatası:', error);
    res.status(500).json({ message: 'Yorum yapılırken bir hata oluştu' });
  }
});

module.exports = router; 