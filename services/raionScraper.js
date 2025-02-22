const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const os = require('os');
const drive = require('../config/googleDrive');

class RaionScraper {
  constructor() {
    this.baseUrl = 'https://raioncom.com';
  }

  async searchAnimeEpisode(animeName, episodeNumber) {
    try {
      const searchUrl = `${this.baseUrl}/${animeName}-${episodeNumber}-bolum`;
      const response = await axios.get(searchUrl);
      const $ = cheerio.load(response.data);
      
      // Video iframe'ini bul
      const videoIframe = $('.arve-iframe');
      const videoUrl = videoIframe.attr('data-src-no-ap');
      
      if (!videoUrl) {
        throw new Error('Video bulunamadı');
      }

      // Google Drive ID'sini çıkar
      const driveId = videoUrl.match(/\/d\/(.+?)\/preview/)?.[1];
      
      if (!driveId) {
        throw new Error('Google Drive ID bulunamadı');
      }

      return {
        driveId,
        pageUrl: searchUrl,
        found: true
      };
    } catch (error) {
      console.error('Raion arama hatası:', error);
      return {
        found: false,
        error: error.message
      };
    }
  }

  async downloadFromGoogleDrive(driveId, tempPath) {
    try {
      console.log('Google Drive indirme başlıyor...');
      console.log('Drive ID:', driveId);

      // Dosya bilgilerini al
      const fileMetadata = await drive.files.get({
        fileId: driveId,
        fields: 'id, name, mimeType, size',
        supportsAllDrives: true
      });

      console.log('Dosya bilgileri alındı:', {
        name: fileMetadata.data.name,
        size: fileMetadata.data.size,
        type: fileMetadata.data.mimeType
      });

      // Dosyayı indir
      const dest = fs.createWriteStream(tempPath);
      let progress = 0;
      let lastLogTime = Date.now();

      const res = await drive.files.get(
        {
          fileId: driveId,
          alt: 'media',
          supportsAllDrives: true
        },
        {
          responseType: 'stream'
        }
      );

      console.log('İndirme başladı');

      return new Promise((resolve, reject) => {
        res.data
          .on('end', () => {
            console.log('İndirme tamamlandı');
            resolve();
          })
          .on('error', err => {
            console.error('İndirme hatası:', err);
            reject(err);
          })
          .on('data', d => {
            progress += d.length;
            const now = Date.now();
            if (now - lastLogTime >= 2000) { // Her 2 saniyede bir log
              const progressMB = (progress / 1024 / 1024).toFixed(2);
              const totalMB = (parseInt(fileMetadata.data.size) / 1024 / 1024).toFixed(2);
              const percent = ((progress / parseInt(fileMetadata.data.size)) * 100).toFixed(2);
              console.log(`İndiriliyor: ${progressMB}/${totalMB} MB (${percent}%)`);
              lastLogTime = now;
            }
          })
          .pipe(dest);

        dest.on('error', err => {
          console.error('Dosya yazma hatası:', err);
          reject(err);
        });
      });
    } catch (error) {
      console.error('Google Drive indirme hatası:', error.message);
      throw new Error(`Video indirme hatası: ${error.message}`);
    }
  }
}

module.exports = new RaionScraper(); 