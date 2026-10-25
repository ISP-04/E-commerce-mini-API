// Routes: กำหนด URL + Middleware chain (Rate limit -> Auth -> Role -> Validate -> Controller)
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

const api = Router();
api.use('/auth', auth);

module.exports = api;
