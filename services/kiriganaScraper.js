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
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const episodes = [];

      $('table tbody tr').each((i, element) => {
        const downloadLink = $(element).find('td[data-label="İndirme Linki"] a').attr('href');
        const buttonText = $(element).find('td[data-label="İndirme Linki"] a').text().trim();

        const episodeData = {
          staff: $(element).find('td[data-label="Emeği Geçenler"]').text().trim(),
          episodeNumber: parseInt($(element).find('td[data-label="Bölüm Numarası"] span').text().split('/')[0]),
          totalEpisodes: parseInt($(element).find('td[data-label="Bölüm Numarası"] span').text().split('/')[1]),
          downloadLink: downloadLink,
          isActive: buttonText === 'Aktif!',
          source: {
            type: downloadLink?.includes('drive.google.com') ? 'gdrive' : 'unknown',
            id: null
          }
        };

        if (episodeData.source.type === 'gdrive') {
          episodeData.source.id = this.extractDriveId(downloadLink);
        }

        console.log('Bulunan bölüm:', {
          episodeNumber: episodeData.episodeNumber,
          sourceType: episodeData.source.type,
          sourceId: episodeData.source.id,
          isActive: episodeData.isActive,
          downloadLink: episodeData.downloadLink
        });

        episodes.push(episodeData);
      });

      const filteredEpisodes = episodes.filter(ep => {
        return ep.isActive && ep.source.id && ep.source.type === 'gdrive';
      });

      console.log('Filtrelenmiş bölümler:', filteredEpisodes.map(ep => ({
        episodeNumber: ep.episodeNumber,
        sourceType: ep.source.type,
        sourceId: ep.source.id
      })));

      return {
        success: true,
        episodes: filteredEpisodes
      };
    } catch (error) {
      console.error('Kirigana scraping error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAnimeInfo(url) {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      
      return {
        success: true,
        title: $('.container.gta-hpm h1').text().trim(),
        totalEpisodes: $('table tbody tr').length
      };
    } catch (error) {
      console.error('Anime info fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new KiriganaScraper();