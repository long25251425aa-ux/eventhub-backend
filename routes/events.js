const r = require('express').Router();
const c = require('../controllers/eventController');
const { protect, adminOnly } = require('../middleware/auth');

// ⚠️ Routes tĩnh PHẢI đặt TRƯỚC /:id
r.get('/categories', c.getCategories);
r.get('/stats', protect, adminOnly, c.getStats);

// CRUD
r.get('/', c.getAll);
r.post('/', protect, c.create);

// Routes có param
r.get('/:id', c.getOne);
r.put('/:id', protect, c.update);
r.delete('/:id', protect, adminOnly, c.remove);
r.patch('/:id/featured', protect, adminOnly, c.toggleFeatured);
r.patch('/:id/publish', protect, c.togglePublish);
r.post('/:id/favorite', protect, c.toggleFavorite);
r.post('/:id/review', protect, c.addReview);

module.exports = r;
