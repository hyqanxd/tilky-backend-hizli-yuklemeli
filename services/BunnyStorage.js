const axios = require('axios');

class BunnyStorage {
  constructor() {
    if (!process.env.BUNNY_STORAGE_ZONE_NAME || !process.env.BUNNY_STORAGE_API_KEY) {
      throw new Error('Bunny Storage yapılandırması eksik');
    }

    this.storageZone = process.env.BUNNY_STORAGE_ZONE_NAME;
    this.accessKey = process.env.BUNNY_STORAGE_API_KEY;
    this.baseUrl = `https://storage.bunnycdn.com/${this.storageZone}/`;
    this.cdnUrl = `https://${this.storageZone}.b-cdn.net/`;
  }

  async uploadFile(path, buffer) {
    try {
      const response = await axios.put(
        this.baseUrl + path,
        buffer,
        {
          headers: {
            'AccessKey': this.accessKey,
            'Content-Type': 'application/octet-stream'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      if (response.status === 201) {
        return {
          success: true,
          url: this.cdnUrl + path,
          path: path
        };
      } else {
        console.error('Beklenmeyen yanıt:', response.status, response.data);
        throw new Error('Dosya yükleme başarısız');
      }
    } catch (error) {
      console.error('Bunny Storage yükleme hatası:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(`Dosya yüklenirken bir hata oluştu: ${error.message}`);
    }
  }

  async deleteFile(path) {
    try {
      const response = await axios.delete(
        this.baseUrl + path,
        {
          headers: {
            'AccessKey': this.accessKey
          }
        }
      );

      return {
        success: response.status === 200,
        message: 'Dosya başarıyla silindi'
      };
    } catch (error) {
      console.error('Bunny Storage silme hatası:', error.response?.data || error.message);
      throw new Error('Dosya silinirken bir hata oluştu');
    }
  }
}

module.exports = BunnyStorage; 