const mongoose = require('mongoose');

async function dropIndex() {
  try {
    await mongoose.connect('mongodb+srv://tumisler8:DO6iryLLLEPYaLxk@cluster0.4q2db.mongodb.net/animedb?retryWrites=true&w=majority&appName=Cluster0/animedb', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const collection = mongoose.connection.collection('animes');
    await collection.dropIndex('seasons.episodes.videoSources.sourceId_1');
    console.log('İndeks başarıyla kaldırıldı');
  } catch (error) {
    console.error('İndeks kaldırılırken hata:', error);
  } finally {
    await mongoose.disconnect();
  }
}

dropIndex(); 