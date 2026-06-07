const router = require('express').Router();
const c = require('../controllers/refundController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/my', protect, c.getMy);
router.get('/', protect, adminOnly, c.getAll);
router.post('/', protect, c.create);
router.patch('/:id', protect, adminOnly, c.review);

module.exports = router;
