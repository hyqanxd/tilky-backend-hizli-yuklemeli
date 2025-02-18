const express = require('express');
const router = express.Router();
const Fansub = require('../models/Fansub');
const auth = require('../middleware/auth');
const admin = require('../middleware/adminAuth');

// Tüm fansubları getir (auth gerekli değil)
router.get('/', async (req, res) => {
  try {
    const fansubs = await Fansub.find();
    res.json(fansubs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ID'ye göre fansub getir (auth gerekli değil)
router.get('/:id', async (req, res) => {
  try {
    const fansub = await Fansub.findById(req.params.id);
    if (!fansub) {
      return res.status(404).json({ message: 'Fansub bulunamadı' });
    }
    res.json(fansub);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Yeni fansub ekle (sadece adminler)
router.post('/', [auth, admin], async (req, res) => {
  const fansub = new Fansub({
    name: req.body.name,
    description: req.body.description,
    logo: req.body.logo,
    website: req.body.website,
    socialMedia: req.body.socialMedia,
    members: req.body.members,
    status: req.body.status || 'active'
  });

  try {
    const newFansub = await fansub.save();
    res.status(201).json(newFansub);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Fansub güncelle (sadece adminler)
router.patch('/:id', [auth, admin], async (req, res) => {
  try {
    const fansub = await Fansub.findById(req.params.id);
    if (!fansub) {
      return res.status(404).json({ message: 'Fansub bulunamadı' });
    }

    const updates = req.body;
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        if (key === 'socialMedia') {
          fansub.socialMedia = { ...fansub.socialMedia, ...updates.socialMedia };
        } else {
          fansub[key] = updates[key];
        }
      }
    });

    const updatedFansub = await fansub.save();
    res.json(updatedFansub);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Fansub sil (sadece adminler)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const fansub = await Fansub.findById(req.params.id);
    if (!fansub) {
      return res.status(404).json({ message: 'Fansub bulunamadı' });
    }
    
    await fansub.deleteOne();
    res.json({ message: 'Fansub silindi' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 