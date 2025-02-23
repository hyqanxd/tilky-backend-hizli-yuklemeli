const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');
const raionScraper = require('../services/raionScraper');
const kiriganaScraper = require('../services/kiriganaScraper');
const BunnyStorage = require('../services/BunnyStorage');
const os = require('os');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// BunnyStorage instance'ı oluştur
const bunnyStorage = new BunnyStorage();

// Tüm animeleri getir
router.get('/list', async (req, res) => {
  try {
    // Timeout promise'i
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 8000)
    );

    // Ana işlem promise'i
    const dataFetch = Anime.find()
      .select('title coverImage bannerImage description genres status rating uploader')
      .populate({
        path: 'uploader',
        select: 'username profileImage'
      })
      .sort({ createdAt: -1 });

    // Promise.race ile ilk tamamlanan işlemi al
    const animes = await Promise.race([dataFetch, timeout]);
    
    console.log(`${animes.length} anime bulundu`);
    console.log('İlk anime örneği:', animes[0]);
    
    res.json(animes);
  } catch (error) {
    console.error('Anime listesi getirme hatası:', error);
    res.status(error.message === 'Request timeout' ? 504 : 500).json({ 
      message: error.message === 'Request timeout' ? 
        'İstek zaman aşımına uğradı' : 'Sunucu hatası',
      error: error.message
    });
  }
});

// AniList'ten anime ara
router.get('/search/anilist', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query ($search: String) {
            Page(page: 1, perPage: 10) {
              media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
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
                episodes
                status
                type
                format
                startDate {
                  year
                  month
                  day
                }
                endDate {
                  year
                  month
                  day
                }
                season
                seasonYear
                averageScore
                genres
                source
                studios {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        `,
        variables: { search: query }
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    const formattedResults = data.data.Page.media.map(anime => ({
      id: anime.id,
      title: {
        romaji: anime.title.romaji || '',
        english: anime.title.english || '',
        native: anime.title.native || ''
      },
      description: anime.description || '',
      coverImage: anime.coverImage?.large || anime.coverImage?.medium || '',
      bannerImage: anime.bannerImage || '',
      type: anime.format || anime.type || '',
      episodes: anime.episodes || 0,
      status: anime.status?.toLowerCase() || 'ongoing',
      genres: anime.genres || [],
      rating: anime.averageScore / 10 || 0,
      releaseDate: anime.startDate?.year ? `${anime.startDate.year}-${String(anime.startDate.month).padStart(2, '0')}-${String(anime.startDate.day).padStart(2, '0')}` : null,
      endDate: anime.endDate?.year ? `${anime.endDate.year}-${String(anime.endDate.month).padStart(2, '0')}-${String(anime.endDate.day).padStart(2, '0')}` : null,
      season: anime.season || '',
      seasonYear: anime.seasonYear || '',
      studios: anime.studios?.nodes?.map(studio => studio.name) || []
    }));

    res.json(formattedResults);
  } catch (error) {
    console.error('AniList API hatası:', error);
    res.status(500).json({ message: 'AniList API hatası', error: error.message });
  }
});

// AniList'ten anime import et
router.post('/import/anilist/:id', auth, async (req, res) => {
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query ($id: Int) {
            Media(id: $id, type: ANIME) {
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
              episodes
              status
              type
              format
              startDate {
                year
                month
                day
              }
              endDate {
                year
                month
                day
              }
              season
              seasonYear
              averageScore
              genres
              source
              studios {
                nodes {
                  name
                }
              }
            }
          }
        `,
        variables: { id: parseInt(req.params.id) }
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    const anilistData = data.data.Media;

    // Mevcut anime'yi kontrol et
    const existingAnime = await Anime.findOne({ 'source.id': anilistData.id.toString(), 'source.name': 'AniList' });
    if (existingAnime) {
      return res.status(400).json({ message: 'Bu anime zaten eklenmiş' });
    }

    // Status değerini dönüştür
    let convertedStatus = 'ongoing';
    switch (anilistData.status?.toLowerCase()) {
      case 'finished':
      case 'completed':
        convertedStatus = 'completed';
        break;
      case 'not_yet_released':
        convertedStatus = 'upcoming';
        break;
      default:
        convertedStatus = 'ongoing';
    }

    // Yeni anime oluştur
    const anime = new Anime({
      title: {
        romaji: anilistData.title.romaji || '',
        english: anilistData.title.english || '',
        native: anilistData.title.native || ''
      },
      description: anilistData.description || '',
      coverImage: anilistData.coverImage?.large || anilistData.coverImage?.medium || '',
      bannerImage: anilistData.bannerImage || '',
      type: anilistData.format || anilistData.type || 'TV',
      episodes: anilistData.episodes || 0,
      status: convertedStatus,
      releaseDate: anilistData.startDate?.year ? new Date(
        anilistData.startDate.year,
        (anilistData.startDate.month || 1) - 1,
        anilistData.startDate.day || 1
      ) : null,
      endDate: anilistData.endDate?.year ? new Date(
        anilistData.endDate.year,
        (anilistData.endDate.month || 1) - 1,
        anilistData.endDate.day || 1
      ) : null,
      rating: anilistData.averageScore ? parseFloat((anilistData.averageScore / 10).toFixed(1)) : 0,
      genres: anilistData.genres || [],
      source: {
        name: 'AniList',
        id: anilistData.id.toString()
      },
      season: anilistData.season?.toLowerCase() || '',
      seasonYear: anilistData.seasonYear || '',
      studios: anilistData.studios?.nodes?.map(studio => studio.name) || [],
      seasons: [], // Boş sezon dizisi
      uploader: req.user.id // _id yerine id kullan
    });

    await anime.save();
    res.status(201).json(anime);
  } catch (error) {
    console.error('AniList import hatası:', error);
    res.status(500).json({ 
      message: 'AniList import hatası', 
      error: error.message,
      details: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      })) : null
    });
  }
});

// Belirli bir anime'yi getir
router.get('/:id', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id)
      .populate({
        path: 'seasons.episodes.videoSources.fansub',
        select: 'name logo website'
      })
      .populate({
        path: 'uploader',
        select: 'username profileImage'
      });
    
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }
    
    res.json(anime);
  } catch (error) {
    console.error('Anime getirme hatası:', error);
    res.status(500).json({ message: 'Anime yüklenirken bir hata oluştu' });
  }
});

// Raioncom'dan bölüm ekle
router.post('/:animeId/episodes/raion', auth, async (req, res) => {
  try {
    const { episodeNumber, animeName, seasonNumber, fansub, quality, language, type } = req.body;
    const animeId = req.params.animeId;

    if (!episodeNumber || !animeName || !seasonNumber) {
      return res.status(400).json({ message: 'Bölüm numarası, anime adı ve sezon numarası gerekli' });
    }

    // User kontrolü
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Kullanıcı bilgisi bulunamadı' });
    }

    // Anime'yi bul ve güncelle
    const anime = await Anime.findById(animeId);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    // Uploader bilgisini kontrol et ve güncelle
    if (!anime.uploader) {
      anime.uploader = req.user.id;
      await anime.save();
    }

    // Sezonu kontrol et
    const season = anime.seasons.find(s => s.seasonNumber === parseInt(seasonNumber));
    if (!season) {
      return res.status(404).json({ message: 'Sezon bulunamadı' });
    }

    // Raioncom'da ara
    const searchResult = await raionScraper.searchAnimeEpisode(animeName, episodeNumber);
    if (!searchResult.found) {
      return res.status(404).json({ message: 'Bölüm Raioncom\'da bulunamadı' });
    }

    // Geçici dosya yolu oluştur
    const tempFilePath = path.join(os.tmpdir(), `${animeName}-${episodeNumber}.mp4`);

    try {
      // Google Drive'dan indir
      await raionScraper.downloadFromGoogleDrive(searchResult.driveId, tempFilePath);

      // Anime adını URL-safe hale getir
      const safeAnimeName = animeName.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // BunnyStorage'a yükle
      const uploadPath = `raion-subs/${safeAnimeName}/sezon-${seasonNumber}/${episodeNumber}.mp4`;
      const uploadResult = await bunnyStorage.uploadFile(uploadPath, fs.readFileSync(tempFilePath));

      if (!uploadResult.success) {
        throw new Error('Video yükleme hatası: ' + uploadResult.error);
      }

      // CDN URL'ini düzelt (çift slash'i kaldır)
      const cdnUrl = uploadResult.url.replace(/([^:])\/\/+/g, '$1/');

      // Mevcut bölümü kontrol et
      const existingEpisodeIndex = season.episodes.findIndex(ep => ep.episodeNumber === parseInt(episodeNumber));
      
      if (existingEpisodeIndex !== -1) {
        // Mevcut bölüme yeni video kaynağını ekle
        const existingEpisode = season.episodes[existingEpisodeIndex];
        const existingSource = existingEpisode.videoSources.find(
          src => src.fansub && src.fansub.toString() === fansub
        );

        if (existingSource) {
          // Aynı fansub'dan kaynak varsa güncelle
          existingSource.url = cdnUrl;
          existingSource.quality = quality || '1080p';
          existingSource.language = language || 'TR';
          existingSource.type = type || 'Altyazılı';
        } else {
          // Yeni fansub kaynağı ekle
          existingEpisode.videoSources.push({
            url: cdnUrl,
            quality: quality || '1080p',
            language: language || 'TR',
            type: type || 'Altyazılı',
            fansub: fansub,
            source: 'Raioncom'
          });
        }
      } else {
        // Yeni bölüm ekle
        const episodeData = {
          episodeNumber: parseInt(episodeNumber),
          title: `${episodeNumber}. Bölüm`,
          description: '',
          thumbnail: '',
          duration: '',
          videoSources: [{
            url: cdnUrl,
            quality: quality || '1080p',
            language: language || 'TR',
            type: type || 'Altyazılı',
            fansub: fansub,
            source: 'Raioncom'
          }]
        };
        season.episodes.push(episodeData);
      }

      // Bölümleri sırala
      season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

      // Debug logları
      console.log('Kaydedilecek bölümler:', season.episodes.map(ep => ({
        episodeNumber: ep.episodeNumber,
        videoSources: ep.videoSources.map(vs => ({
          source: vs.source,
          url: vs.url,
          isEmbed: vs.isEmbed
        }))
      })));

      await anime.save();

      // Geçici dosyayı sil
      fs.unlinkSync(tempFilePath);

      res.json({
        message: 'Bölüm başarıyla eklendi',
        episode: season.episodes.find(ep => ep.episodeNumber === parseInt(episodeNumber))
      });

    } catch (error) {
      // Hata durumunda geçici dosyayı temizle
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw error;
    }

  } catch (error) {
    console.error('Raioncom bölüm ekleme hatası:', error);
    res.status(500).json({ message: 'Bölüm eklenirken bir hata oluştu', error: error.message });
  }
});

// Kirigana'dan bölüm ekle
router.post('/:animeId/episodes/kirigana', auth, async (req, res) => {
  try {
    const { url, seasonNumber, fansub } = req.body;
    const animeId = req.params.animeId;

    if (!url || !seasonNumber) {
      return res.status(400).json({ message: 'URL ve sezon numarası gerekli' });
    }

    // User kontrolü
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Kullanıcı bilgisi bulunamadı' });
    }

    // Anime'yi bul
    const anime = await Anime.findById(animeId);
    if (!anime) {
      return res.status(404).json({ message: 'Anime bulunamadı' });
    }

    // Uploader bilgisini kontrol et ve güncelle
    if (!anime.uploader) {
      anime.uploader = req.user.id;
      await anime.save();
    }

    // Sezonu kontrol et
    const season = anime.seasons.find(s => s.seasonNumber === parseInt(seasonNumber));
    if (!season) {
      return res.status(404).json({ message: 'Sezon bulunamadı' });
    }

    // Kirigana'dan bölümleri çek
    const scrapeResult = await kiriganaScraper.scrapeAnimePage(url);
    if (!scrapeResult.success) {
      return res.status(500).json({ message: 'Bölümler çekilemedi', error: scrapeResult.error });
    }

    // Her bölüm için
    for (const episode of scrapeResult.episodes) {
      console.log(`Bölüm ${episode.episodeNumber} işleniyor... (Kaynak: ${episode.source.type})`);

      // Her bölüm için videoSources dizisini başlat
      if (!episode.videoSources) {
        episode.videoSources = [];
      }

      if (episode.source.type === 'gdrive') {
        // Google Drive işlemi
        const tempFilePath = path.join(os.tmpdir(), `${anime.title.romaji}-${episode.episodeNumber}.mp4`);
        
        try {
          console.log('Google Drive indirme başlıyor..');
          // Google Drive'dan indir
          await raionScraper.downloadFromGoogleDrive(episode.source.id, tempFilePath);

          // Anime adını URL-safe hale getir
          const safeAnimeName = anime.title.romaji.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

          // BunnyStorage'a yükle
          const uploadPath = `kirigana/${safeAnimeName}/sezon-${seasonNumber}/${episode.episodeNumber}.mp4`;
          const uploadResult = await bunnyStorage.uploadFile(uploadPath, fs.readFileSync(tempFilePath));

          if (!uploadResult.success) {
            throw new Error('Video yükleme hatası: ' + uploadResult.error);
          }

          // CDN URL'ini düzelt
          const cdnUrl = uploadResult.url.replace(/([^:])\/\/+/g, '$1/');

          // Video kaynağı nesnesini oluştur ve ekle
          episode.videoSources.push({
            url: cdnUrl,
            quality: '1080p',
            language: 'TR',
            type: 'Altyazılı',
            fansub: fansub,
            source: 'Kirigana-GDrive'
          });

          // Geçici dosyayı sil
          fs.unlinkSync(tempFilePath);
          console.log(`Bölüm ${episode.episodeNumber} için Google Drive işlemi tamamlandı`);

        } catch (error) {
          // Hata durumunda geçici dosyayı temizle
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          console.warn(`Bölüm ${episode.episodeNumber} için Google Drive işleme hatası:`, error.message);
          continue; // Bu bölümü atla ve diğerine geç
        }
      }

      // Video kaynağı eklenmediyse bu bölümü atla
      if (!episode.videoSources.length) {
        console.warn(`Bölüm ${episode.episodeNumber} için hiç video kaynağı eklenemedi`);
        continue;
      }

      try {
        // Mevcut bölümü kontrol et
        const existingEpisodeIndex = season.episodes.findIndex(ep => ep.episodeNumber === episode.episodeNumber);
        
        if (existingEpisodeIndex !== -1) {
          // Mevcut bölüme yeni video kaynağını ekle
          const existingEpisode = season.episodes[existingEpisodeIndex];
          
          // videoSources dizisini kontrol et
          if (!existingEpisode.videoSources) {
            existingEpisode.videoSources = [];
          }

          // Yeni video kaynağını ekle
          existingEpisode.videoSources.push(...episode.videoSources);
          console.log(`Bölüm ${episode.episodeNumber} güncellendi`);

        } else {
          // Yeni bölüm ekle
          const episodeData = {
            episodeNumber: episode.episodeNumber,
            title: `${episode.episodeNumber}. Bölüm`,
            description: '',
            thumbnail: '',
            duration: '',
            staff: episode.staff,
            videoSources: episode.videoSources
          };
          season.episodes.push(episodeData);
          console.log(`Bölüm ${episode.episodeNumber} eklendi`);
        }
      } catch (error) {
        console.error(`Bölüm ${episode.episodeNumber} kaydedilirken hata:`, error);
        continue;
      }
    }

    // Bölümleri sırala
    season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

    // Debug logları
    console.log('Kaydedilecek bölümler:', season.episodes.map(ep => ({
      episodeNumber: ep.episodeNumber,
      videoSources: ep.videoSources.map(vs => ({
        source: vs.source,
        url: vs.url,
        isEmbed: vs.isEmbed
      }))
    })));

    await anime.save();

    res.json({
      message: 'Bölümler başarıyla eklendi',
      addedEpisodes: scrapeResult.episodes.length,
      episodes: season.episodes.map(ep => ({
        episodeNumber: ep.episodeNumber,
        videoSources: ep.videoSources.length
      }))
    });

  } catch (error) {
    console.error('Kirigana bölüm ekleme hatası:', error);
    res.status(500).json({ 
      message: 'Bölümler eklenirken bir hata oluştu', 
      error: error.message,
      details: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      })) : null
    });
  }
});

module.exports = router; 