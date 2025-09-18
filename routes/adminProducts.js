const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, admin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Product = require('../models/Product');
const { logger } = require('../utils/logger');
const router = express.Router();
const Category = require('../models/Category');

// Get product by ID (Admin)
router.get('/:id', protect, admin, asyncHandler(async (req, res) => {
  console.log('ADMIN GET PRODUCT BY ID:', req.params.id);
  const product = await Product.findById(req.params.id);
  console.log('ADMIN PRODUCT QUERY RESULT:', product);
  if (!product) {
    console.log('ADMIN PRODUCT NOT FOUND:', req.params.id);
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, data: { product } });
}))

// Update product by ID (Admin)
router.put('/:id', protect, admin, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name 2-100 chars'),
  body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description 10-1000 chars'),
  body('category').notEmpty().withMessage('Category required'),
  body('image').notEmpty().withMessage('Main image is required'),
  body('sizes').isArray({ min: 1 }).withMessage('At least one size required'),
  body('sizes.*.size').notEmpty().withMessage('Size label required'),
  body('sizes.*.price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('sizes.*.stock').isInt({ min: 0 }).withMessage('Stock must be >= 0'),
  body('ingredients').notEmpty().withMessage('Ingredients required'),
  body('nutrition.calories').notEmpty().withMessage('Calories required'),
  body('nutrition.protein').notEmpty().withMessage('Protein required'),
  body('nutrition.carbs').notEmpty().withMessage('Carbs required'),
  body('nutrition.fat').notEmpty().withMessage('Fat required'),
  body('nutrition.fiber').notEmpty().withMessage('Fiber required'),
  body('youtubeVideo').optional().isString().isLength({ max: 300 }).withMessage('YouTube video link too long'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() })
  }
  // Validate category against Category collection
  const categoryName = req.body.category
  const categoryDoc = await Category.findOne({ name: categoryName, isActive: true })
  if (!categoryDoc) {
    return res.status(400).json({ success: false, message: 'Invalid category' })
  }
  const product = await Product.findById(req.params.id)
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' })
  }
  Object.assign(product, { ...req.body, category: categoryDoc.name })
  await product.save()
  res.json({ success: true, message: 'Product updated', data: { product } })
}))

// Create a full product (Admin)
router.post('/', protect, admin, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name 2-100 chars'),
  body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description 10-1000 chars'),
  body('category').notEmpty().withMessage('Category required'),
  body('image').notEmpty().withMessage('Main image is required'),
  body('sizes').isArray({ min: 1 }).withMessage('At least one size required'),
  body('sizes.*.size').notEmpty().withMessage('Size label required'),
  body('sizes.*.price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('sizes.*.stock').isInt({ min: 0 }).withMessage('Stock must be >= 0'),
  body('ingredients').notEmpty().withMessage('Ingredients required'),
  body('nutrition.calories').notEmpty().withMessage('Calories required'),
  body('nutrition.protein').notEmpty().withMessage('Protein required'),
  body('nutrition.carbs').notEmpty().withMessage('Carbs required'),
  body('nutrition.fat').notEmpty().withMessage('Fat required'),
  body('nutrition.fiber').notEmpty().withMessage('Fiber required'),
  body('youtubeVideo').optional().isString().isLength({ max: 300 }).withMessage('YouTube video link too long'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  // Validate category against Category collection
  const categoryName = req.body.category;
  const categoryDoc = await Category.findOne({ name: categoryName, isActive: true });
  if (!categoryDoc) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }
  try {
    const product = await Product.create({ ...req.body, category: categoryDoc.name });
    res.status(201).json({ success: true, message: 'Product created', data: { product } });
  } catch (e) {
    logger.error('Admin product create error:', e);
    res.status(500).json({ success: false, message: 'Error creating product' });
  }
}));

module.exports = router;
