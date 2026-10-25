const { Router } = require('express');
const c = require('../controllers');
 
const products = Router();
products.get('/', c.products.list);
products.get('/:id', c.products.get);
 
const api = Router();
api.use('/products', products);
 
module.exports = api;
