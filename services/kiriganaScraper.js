const axios = require('axios');
const cheerio = require('cheerio');

class KiriganaScraper {
  constructor() {
    this.baseUrl = 'https://www.kiriganafairies.net';
  }

  extractDriveId(url) {
    if (!url) return null;
    const driveMatch = url.match(/\/d\/(.*?)\/view/);
    return driveMatch ? driveMatch[1] : null;
  }

  async scrapeAnimePage(url) {
    try {
      console.log('Kirigana sayfası taranıyor:', url);
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const episodes = [];

      if (!$('table tbody tr').length) {
        console.warn('Tabloda bölüm bulunamadı');
        return {
          success: false,
          error: 'Bölüm tablosu bulunamadı'
        };
      }

      $('table tbody tr').each((i, element) => {
        const downloadLink = $(element).find('td[data-label="İndirme Linki"] a').attr('href');
        const buttonText = $(element).find('td[data-label="İndirme Linki"] a').text().trim();
        const episodeText = $(element).find('td[data-label="Bölüm Numarası"] span').text();

        if (!episodeText) {
          console.warn('Bölüm numarası bulunamadı, satır atlanıyor');
          return;
        }

        const [episodeNumber, totalEpisodes] = episodeText.split('/').map(num => parseInt(num.trim()));

        if (!episodeNumber) {
          console.warn('Geçersiz bölüm numarası, satır atlanıyor');
          return;
        }

        const episodeData = {
          staff: $(element).find('td[data-label="Emeği Geçenler"]').text().trim(),
          episodeNumber,
          totalEpisodes: totalEpisodes || 0,
          downloadLink: downloadLink,
          isActive: buttonText === 'Aktif!',
          source: {
            type: downloadLink?.includes('drive.google.com') ? 'gdrive' : 'unknown',
            id: null
          }
        };

        if (episodeData.source.type === 'gdrive') {
          episodeData.source.id = this.extractDriveId(downloadLink);
          if (!episodeData.source.id) {
            console.warn(`Bölüm ${episodeNumber} için geçersiz Drive ID`);
            return;
          }
        }

        console.log('Bölüm bulundu:', {
          episodeNumber: episodeData.episodeNumber,
          sourceType: episodeData.source.type,
          sourceId: episodeData.source.id,
          isActive: episodeData.isActive,
          downloadLink: episodeData.downloadLink
        });

        episodes.push(episodeData);
      });

      const filteredEpisodes = episodes.filter(ep => {
        const isValid = ep.isActive && ep.source.id && ep.source.type === 'gdrive';
        if (!isValid) {
          console.warn(`Bölüm ${ep.episodeNumber} filtrelendi: ${!ep.isActive ? 'Aktif değil' : !ep.source.id ? 'Drive ID yok' : 'Drive linki değil'}`);
        }
        return isValid;
      });

      console.log('İşlenebilir bölümler:', filteredEpisodes.map(ep => ({
        episodeNumber: ep.episodeNumber,
        sourceType: ep.source.type,
        sourceId: ep.source.id
      })));

      if (filteredEpisodes.length === 0) {
        return {
          success: false,
          error: 'İşlenebilir bölüm bulunamadı'
        };
      }

      return {
        success: true,
        episodes: filteredEpisodes
      };
    } catch (error) {
      console.error('Kirigana scraping hatası:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAnimeInfo(url) {
    try {
      console.log('Anime bilgisi alınıyor:', url);
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      
      const title = $('.container.gta-hpm h1').text().trim();
      const totalEpisodes = $('table tbody tr').length;

      if (!title) {
        console.warn('Anime başlığı bulunamadı');
        return {
          success: false,
          error: 'Anime başlığı bulunamadı'
        };
      }

      console.log('Anime bilgisi bulundu:', { title, totalEpisodes });
      
      return {
        success: true,
        title,
        totalEpisodes
      };
    } catch (error) {
      console.error('Anime bilgisi alma hatası:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new KiriganaScraper();