const r = require('express').Router();
const c = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/auth');

r.post('/', protect, c.create);
r.get('/my/tickets', protect, c.getMyTickets);
r.get('/my/orders', protect, c.getMyOrders);
r.get('/', protect, adminOnly, c.getAll);
r.patch('/:id/confirm-payment', protect, adminOnly, c.confirmPayment);
r.patch('/checkin/:code', protect, adminOnly, c.checkin);
r.delete('/:id', protect, adminOnly, c.cancel);

module.exports = r;
