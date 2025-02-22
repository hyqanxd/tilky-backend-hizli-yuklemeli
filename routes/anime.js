const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const fetch = require('node-fetch');
const auth = require('../middleware/auth');

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

module.exports = router; 