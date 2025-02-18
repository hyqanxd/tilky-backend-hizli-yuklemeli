const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');
const adminAuth = require('../middleware/adminAuth');
const auth = require('../middleware/auth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const BunnyStorage = require('../services/BunnyStorage');
const upload = require('../middleware/upload');

// Anilist'ten manga ara
router.get('/search/anilist', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await axios.post('https://graphql.anilist.co', {
      query: `
        query ($search: String) {
          Page(page: 1, perPage: 10) {
            media(search: $search, type: MANGA) {
              id
              title {
                romaji
                english
                native
              }
              description
              coverImage {
                large
                medium
              }
              bannerImage
              genres
              status
              startDate {
                year
              }
              staff {
                edges {
                  role
                  node {
                    name {
                      full
                    }
                  }
                }
              }
              averageScore
              format
              countryOfOrigin
            }
          }
        }
      `,
      variables: { search: query }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Tüm mangaları getir
router.get('/', async (req, res) => {
  try {
    const mangas = await Manga.find({ isActive: true })
      .select('title coverImage status type rating views chapters alternativeTitles');
    res.json(mangas);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Manga detaylarını getir
router.get('/:id', async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) {
      return res.status(404).json({ message: 'Manga bulunamadı' });
    }
    res.json(manga);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Yeni manga ekle (Admin)
router.post('/', auth, adminAuth, async (req, res) => {
  const manga = new Manga(req.body);
  try {
    const newManga = await manga.save();
    res.status(201).json(newManga);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Manga güncelle (Admin)
router.patch('/:id', auth, adminAuth, async (req, res) => {
  try {
    const manga = await Manga.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(manga);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Manga sil (Admin)
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    await Manga.findByIdAndDelete(req.params.id);
    res.json({ message: 'Manga başarıyla silindi' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bölüm ekle (Admin)
router.post('/:id/chapters', auth, adminAuth, async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) {
      return res.status(404).json({ message: 'Manga bulunamadı' });
    }

    const { chapterNumber, title, pages } = req.body;

    // Bölüm numarasının benzersiz olduğunu kontrol et
    const existingChapter = manga.chapters.find(c => c.chapterNumber === chapterNumber);
    if (existingChapter) {
      return res.status(400).json({ message: 'Bu bölüm numarası zaten mevcut' });
    }

    // Yeni bölümü ekle
    manga.chapters.push({
      chapterNumber,
      title,
      pages,
      uploadDate: new Date()
    });

    // Bölümleri sırala
    manga.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

    const updatedManga = await manga.save();
    res.status(201).json(updatedManga);
  } catch (error) {
    console.error('Bölüm ekleme hatası:', error);
    res.status(400).json({ message: 'Bölüm eklenirken bir hata oluştu', error: error.message });
  }
});

// Bölüm güncelle (Admin)
router.patch('/:id/chapters/:chapterId', auth, adminAuth, async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) {
      return res.status(404).json({ message: 'Manga bulunamadı' });
    }

    const chapter = manga.chapters.id(req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Bölüm bulunamadı' });
    }

    // Bölüm numarası değiştiriliyorsa benzersizliğini kontrol et
    if (req.body.chapterNumber && req.body.chapterNumber !== chapter.chapterNumber) {
      const existingChapter = manga.chapters.find(
        c => c.chapterNumber === req.body.chapterNumber && c._id.toString() !== req.params.chapterId
      );
      if (existingChapter) {
        return res.status(400).json({ message: 'Bu bölüm numarası zaten mevcut' });
      }
    }

    // Bölümü güncelle
    Object.assign(chapter, req.body);
    
    // Bölümleri sırala
    manga.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

    const updatedManga = await manga.save();
    res.json(updatedManga);
  } catch (error) {
    console.error('Bölüm güncelleme hatası:', error);
    res.status(400).json({ message: 'Bölüm güncellenirken bir hata oluştu', error: error.message });
  }
});

// Bölüm sil (Admin)
router.delete('/:id/chapters/:chapterId', auth, adminAuth, async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) {
      return res.status(404).json({ message: 'Manga bulunamadı' });
    }

    const chapter = manga.chapters.id(req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Bölüm bulunamadı' });
    }

    chapter.remove();
    const updatedManga = await manga.save();
    res.json({ message: 'Bölüm başarıyla silindi', manga: updatedManga });
  } catch (error) {
    console.error('Bölüm silme hatası:', error);
    res.status(400).json({ message: 'Bölüm silinirken bir hata oluştu', error: error.message });
  }
});

// Bölüm yükleme (Admin)
router.post('/:id/chapters/upload', auth, adminAuth, upload.array('pages'), async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) {
      return res.status(404).json({ message: 'Manga bulunamadı' });
    }

    const { chapterNumber, title } = req.body;
    if (!chapterNumber || !req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Bölüm numarası ve sayfalar gerekli' });
    }

    // Bölüm numarasının benzersiz olduğunu kontrol et
    const existingChapter = manga.chapters.find(c => c.chapterNumber === parseInt(chapterNumber));
    if (existingChapter) {
      return res.status(400).json({ message: 'Bu bölüm numarası zaten mevcut' });
    }

    const bunnyStorage = new BunnyStorage();
    const pages = [];

    // Dosyaları sırala
    const sortedFiles = req.files.sort((a, b) => {
      const aNum = parseInt(a.originalname.split('.')[0]);
      const bNum = parseInt(b.originalname.split('.')[0]);
      return aNum - bNum;
    });

    // Her sayfayı Bunny Storage'a yükle
    for (const file of sortedFiles) {
      try {
        const uploadPath = `manga/${manga._id}/bolum-${chapterNumber}/${file.originalname}`;
        const uploadResult = await bunnyStorage.uploadFile(uploadPath, file.buffer);
        
        if (!uploadResult.success) {
          throw new Error(`Dosya yüklenemedi: ${file.originalname}`);
        }

        // CDN URL'ini pages dizisine ekle
        const cdnUrl = `https://${process.env.BUNNY_STORAGE_ZONE_NAME}.b-cdn.net/${uploadPath}`;
        pages.push(cdnUrl);
        
        console.log(`Sayfa yüklendi: ${cdnUrl}`);
      } catch (uploadError) {
        console.error(`Sayfa yükleme hatası (${file.originalname}):`, uploadError);
        throw uploadError;
      }
    }

    if (pages.length === 0) {
      throw new Error('Hiçbir sayfa yüklenemedi');
    }

    // Yeni bölümü ekle
    manga.chapters.push({
      chapterNumber: parseInt(chapterNumber),
      title: title || `Bölüm ${chapterNumber}`,
      pages,
      uploadDate: new Date()
    });

    // Bölümleri sırala
    manga.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

    const updatedManga = await manga.save();
    res.status(201).json({
      message: 'Bölüm başarıyla eklendi',
      manga: updatedManga,
      uploadedPages: pages
    });
  } catch (error) {
    console.error('Bölüm yükleme hatası:', error);
    res.status(400).json({ 
      message: 'Bölüm eklenirken bir hata oluştu', 
      error: error.message,
      details: error.response?.data || error.stack
    });
  }
});

// Bölüm detaylarını getir
router.get('/:id/chapter/:chapterId', async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) {
      return res.status(404).json({ message: 'Manga bulunamadı' });
    }

    const chapter = manga.chapters.id(req.params.chapterId);
    if (!chapter) {
      return res.status(404).json({ message: 'Bölüm bulunamadı' });
    }

    res.json({
      _id: chapter._id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      pages: chapter.pages,
      uploadDate: chapter.uploadDate,
      mangaTitle: manga.title
    });
  } catch (error) {
    console.error('Bölüm getirme hatası:', error);
    res.status(500).json({ message: 'Bölüm getirilirken bir hata oluştu' });
  }
});

module.exports = router; 