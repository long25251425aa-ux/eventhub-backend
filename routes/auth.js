const router = require('express').Router();
const c = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', c.register);
router.post('/login', c.login);
router.get('/me', protect, c.getMe);
router.put('/profile', protect, c.updateProfile);
router.put('/password', protect, c.changePassword);
router.put('/change-password', protect, c.changePassword);

module.exports = router;
