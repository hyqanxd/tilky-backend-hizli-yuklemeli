const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_STORAGE_ZONE_NAME = process.env.BUNNY_STORAGE_ZONE_NAME;

const uploadToBunnyStorage = async (filePath, fileName) => {
  try {
    if (!process.env.BUNNY_STORAGE_API_KEY || !process.env.BUNNY_STORAGE_ZONE_NAME) {
      throw new Error('Bunny Storage yapılandırması eksik');
    }

    const fileBuffer = fs.readFileSync(filePath);

    const response = await axios.put(
      `https://storage.bunnycdn.com/${process.env.BUNNY_STORAGE_ZONE_NAME}/${fileName}`,
      fileBuffer,
      {
        headers: {
          'AccessKey': process.env.BUNNY_STORAGE_API_KEY,
          'Content-Type': 'application/octet-stream'
        }
      }
    );

    if (response.status === 201) {
      return {
        success: true,
        url: `https://${process.env.BUNNY_STORAGE_ZONE_NAME}.b-cdn.net/${fileName}`
      };
    } else {
      throw new Error('Dosya yüklenemedi');
    }
  } catch (error) {
    console.error('Bunny Storage yükleme hatası:', error);
    throw error;
  }
};

const deleteFromBunnyStorage = async (fileName) => {
  try {
    const response = await axios.delete(
      `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE_NAME}/${fileName}`,
      {
        headers: {
          'AccessKey': BUNNY_STORAGE_API_KEY
        }
      }
    );

    return response.status === 200;
  } catch (error) {
    console.error('Bunny Storage silme hatası:', error);
    throw error;
  }
};

module.exports = {
  uploadToBunnyStorage,
  deleteFromBunnyStorage
}; 