const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { protect, admin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Category = require('../models/Category');
const { logger } = require('../utils/logger');

const router = express.Router();

// Public: list active categories
router.get('/', asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ name: 1 }).select('-__v');
  res.json({ success: true, data: { categories } });
}));

// Catch PUT requests without ID and provide helpful error
router.put('/', (req, res) => {
  res.status(400).json({ 
    success: false, 
    message: 'Category ID is required. Use PUT /api/categories/:id to update a category.',
    hint: 'The URL should include the category ID, e.g., /api/categories/64f8a1b2c3d4e5f6a7b8c9d0'
  });
});

// Admin: list all categories (active & inactive)
router.get('/all', protect, admin, asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ createdAt: -1 }).select('-__v');
  res.json({ success: true, data: { categories } });
}));

// Create category (admin)
router.post('/', protect, admin, [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 chars'),
  body('description').optional().trim().isLength({ max: 300 }).withMessage('Description too long'),
  body('image').optional().trim().custom((value) => {
    if (value && value !== '') {
      // Only validate URL if a value is provided
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(value)) {
        throw new Error('Image must be a valid URL');
      }
    }
    return true;
  }).withMessage('Image must be a valid URL')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    // Clean the input data
    const categoryData = {
      name: req.body.name.trim(),
      ...(req.body.description && req.body.description.trim() && { description: req.body.description.trim() }),
      ...(req.body.image && req.body.image.trim() && { image: req.body.image.trim() })
    };
    
    const existing = await Category.findOne({ name: categoryData.name });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }
    const category = await Category.create(categoryData);
    res.status(201).json({ success: true, message: 'Category created', data: { category } });
  } catch (e) {
    logger.error('Create category error:', e);
    if (e.code === 11000) {
      res.status(400).json({ success: false, message: 'Category name already exists' });
    } else {
      res.status(500).json({ success: false, message: 'Error creating category' });
    }
  }
}));

// Update category
router.put('/:id', protect, admin, [
  param('id').isMongoId().withMessage('Invalid ID'),
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 chars'),
  body('description').optional().trim().isLength({ max: 300 }).withMessage('Description too long'),
  body('image').optional().trim().custom((value) => {
    if (value && value !== '') {
      // Only validate URL if a value is provided
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(value)) {
        throw new Error('Image must be a valid URL');
      }
    }
    return true;
  }).withMessage('Image must be a valid URL'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
], asyncHandler(async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    // Clean and update only provided fields
    if (req.body.name !== undefined) category.name = req.body.name.trim();
    if (req.body.description !== undefined) category.description = req.body.description.trim() || null;
    if (req.body.image !== undefined) category.image = req.body.image.trim() || null;
    if (req.body.isActive !== undefined) category.isActive = req.body.isActive;
    
    await category.save();
    res.json({ success: true, message: 'Category updated', data: { category } });
  } catch (e) {
    logger.error('Update category error:', e);
    if (e.code === 11000) {
      res.status(400).json({ success: false, message: 'Category name already exists' });
    } else {
      res.status(500).json({ success: false, message: 'Error updating category' });
    }
  }
}));

// Catch PATCH requests without ID and provide helpful error
router.patch('/', (req, res) => {
  res.status(400).json({ 
    success: false, 
    message: 'Category ID is required. Use PATCH /api/categories/:id/status to toggle category status.',
    hint: 'The URL should include the category ID, e.g., /api/categories/64f8a1b2c3d4e5f6a7b8c9d0/status'
  });
});

// Toggle status (shortcut)
router.patch('/:id/status', protect, admin, [
  param('id').isMongoId().withMessage('Invalid ID'),
  body('isActive').isBoolean().withMessage('isActive must be boolean')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { isActive: req.body.isActive },
    { new: true }
  );
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }
  res.json({ success: true, message: 'Status updated', data: { category } });
}));

// Catch DELETE requests without ID and provide helpful error
router.delete('/', (req, res) => {
  res.status(400).json({ 
    success: false, 
    message: 'Category ID is required. Use DELETE /api/categories/:id to delete a category.',
    hint: 'The URL should include the category ID, e.g., /api/categories/64f8a1b2c3d4e5f6a7b8c9d0'
  });
});

// Delete category (hard delete; does not affect Product schema)
router.delete('/:id', protect, admin, [
  param('id').isMongoId().withMessage('Invalid ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }
  res.json({ success: true, message: 'Category deleted' });
}));

module.exports = router;
