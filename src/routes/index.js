// ชั้น Route: กำหนด URL + Middleware chain (Rate limit -> Auth -> Role -> Validate -> Controller)
const { Router } = require('express');
const c = require('../controllers');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimit');
const s = require('../validators/schemas');
 
const auth = Router();
auth.post('/register', authLimiter, validate({ body: s.auth.register }), c.auth.register);
auth.post('/login', authLimiter, validate({ body: s.auth.login }), c.auth.login);
auth.get('/me', authenticate, c.auth.me);
 
const products = Router();
products.get('/', optionalAuth, validate({ query: s.product.listQuery }), c.products.list);
products.get('/:id', optionalAuth, validate({ params: s.idParam }), c.products.get);
products.post('/', ...adminOnly, validate({ body: s.product.create }), c.products.create);
products.put('/:id', ...adminOnly, validate({ params: s.idParam, body: s.product.update }), c.products.update);
products.delete('/:id', ...adminOnly, validate({ params: s.idParam }), c.products.remove);
 
const cart = Router();
cart.use(authenticate); // ทุก Endpoint ของตะกร้าต้องล็อกอิน
cart.get('/', c.cart.get);
cart.post('/', validate({ body: s.cart.add }), c.cart.add);
cart.patch('/:itemId', validate({ params: s.itemIdParam, body: s.cart.update }), c.cart.update);
cart.delete('/:itemId', validate({ params: s.itemIdParam }), c.cart.remove);
 
const api = Router();
api.use('/auth', auth);
api.use('/products', products);
api.use('/cart', cart);
 
module.exports = api;
