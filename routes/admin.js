const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const { logger } = require('../utils/logger');

// Apply admin middleware to all routes
router.use(protect);
router.use(admin);

// ==================== DASHBOARD STATS ====================
router.get('/dashboard', async (req, res) => {
  try {
    console.log('Dashboard route hit by user:', req.user?.email, 'role:', req.user?.role);
    
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Get counts with error handling for each query
    let totalUsers, totalProducts, totalOrders, totalRevenue;
    
    try {
      totalUsers = await User.countDocuments({ role: 'user' });
    } catch (error) {
      console.error('Error counting users:', error);
      totalUsers = 0;
    }

    try {
      totalProducts = await Product.countDocuments();
    } catch (error) {
      console.error('Error counting products:', error);
      totalProducts = 0;
    }

    try {
      totalOrders = await Order.countDocuments();
    } catch (error) {
      console.error('Error counting orders:', error);
      totalOrders = 0;
    }

    try {
      const revenueResult = await Order.aggregate([
        { $match: { orderStatus: { $in: ['delivered'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      totalRevenue = revenueResult;
    } catch (error) {
      console.error('Error calculating total revenue:', error);
      totalRevenue = [];
    }

    // Monthly stats with error handling
    let monthlyOrders, monthlyRevenue;
    
    try {
      monthlyOrders = await Order.countDocuments({
        createdAt: { $gte: startOfMonth }
      });
    } catch (error) {
      console.error('Error counting monthly orders:', error);
      monthlyOrders = 0;
    }

    try {
      const monthlyRevenueResult = await Order.aggregate([
        { 
          $match: { 
            createdAt: { $gte: startOfMonth },
            orderStatus: { $in: ['delivered'] }
          } 
        },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      monthlyRevenue = monthlyRevenueResult;
    } catch (error) {
      console.error('Error calculating monthly revenue:', error);
      monthlyRevenue = [];
    }

    // Recent orders with error handling
    let recentOrders;
    try {
      recentOrders = await Order.find()
        .populate('user', 'firstName lastName email')
        .select('orderNumber total orderStatus paymentStatus createdAt')
        .sort({ createdAt: -1 })
        .limit(5);
    } catch (error) {
      console.error('Error fetching recent orders:', error);
      recentOrders = [];
    }

    // Top selling products with error handling
    let topProducts;
    try {
      topProducts = await Order.aggregate([
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' }
      ]);
    } catch (error) {
      console.error('Error fetching top products:', error);
      topProducts = [];
    }

    // Low stock alerts with error handling
    let lowStockProducts, outOfStockProducts;
    
    try {
      lowStockProducts = await Product.find({
        $expr: {
          $lt: [
            { $sum: '$sizes.stock' },
            10 // Alert when total stock is below 10
          ]
        }
      }).select('name sizes').limit(20);
    } catch (error) {
      console.error('Error fetching low stock products:', error);
      lowStockProducts = [];
    }

    try {
      outOfStockProducts = await Product.find({
        $expr: {
          $eq: [
            { $sum: '$sizes.stock' },
            0
          ]
        }
      }).select('name sizes').limit(20);
    } catch (error) {
      console.error('Error fetching out of stock products:', error);
      outOfStockProducts = [];
    }

    const responseData = {
      success: true,
      data: {
        stats: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          monthlyOrders,
          monthlyRevenue: monthlyRevenue[0]?.total || 0
        },
        recentOrders,
        topProducts,
        alerts: {
          lowStockProducts,
          outOfStockProducts
        }
      }
    };

    console.log('Dashboard response data:', JSON.stringify(responseData, null, 2));
    res.json(responseData);
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    console.error('Dashboard stats error:', error.stack || error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message || error
    });
  }
});

// ==================== USER MANAGEMENT ====================
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '', status = '' } = req.query;
    
    const query = { role: { $ne: 'admin' } };
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) query.role = role;
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalUsers: total
        }
      }
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

router.put('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    logger.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status'
    });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndDelete(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user'
    });
  }
});

// ==================== PRODUCT MANAGEMENT ====================
// Get a single product by ID
router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    logger.error('Get product by ID error:', error);
    res.status(500).json({ success: false, message: 'Error fetching product' });
  }
});
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', category = '', status = '' } = req.query;

    const baseQuery = {};
    if (search) {
      baseQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (category) baseQuery.category = category;

    // Fetch all matching (without stock filter), then filter by computed total stock
    let productsAll = await Product.find(baseQuery).sort({ createdAt: -1 });

    // totalStock virtual already defined; ensure it's available when serialized
    if (status === 'inStock') {
      productsAll = productsAll.filter(p => p.totalStock > 0);
    } else if (status === 'outOfStock') {
      productsAll = productsAll.filter(p => p.totalStock === 0);
    }

    const total = productsAll.length;
    const currentPage = parseInt(page, 10);
    const perPage = parseInt(limit, 10);
    const start = (currentPage - 1) * perPage;
    const paginated = productsAll.slice(start, start + perPage);

    res.json({
      success: true,
      data: {
        products: paginated,
        pagination: {
          currentPage,
            totalPages: Math.ceil(total / perPage) || 1,
            totalProducts: total
        }
      }
    });
  } catch (error) {
    logger.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products'
    });
  }
});

router.post('/products', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    logger.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating product'
    });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    logger.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product'
    });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    logger.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting product'
    });
  }
});

// ==================== ORDER MANAGEMENT ====================
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '', search = '' } = req.query;
    
    const query = {};
    
    if (status) query.orderStatus = status;
    if (search) {
      query.orderNumber = { $regex: search, $options: 'i' };
    }

    const orders = await Order.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalOrders: total
        }
      }
    });
  } catch (error) {
    logger.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders'
    });
  }
});

router.put('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      id,
      { orderStatus: status },
      { new: true }
    ).populate('user', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    logger.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status'
    });
  }
});

// ==================== COUPON MANAGEMENT ====================
// Get a single coupon by ID
router.get('/coupons/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    res.json({ success: true, data: { coupon } });
  } catch (error) {
    logger.error('Get coupon by ID error:', error);
    res.status(500).json({ success: false, message: 'Error fetching coupon' });
  }
});
router.get('/coupons', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '' } = req.query;
    
    const query = {};
    
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const coupons = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Coupon.countDocuments(query);

    res.json({
      success: true,
      data: {
        coupons,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalCoupons: total
        }
      }
    });
  } catch (error) {
    logger.error('Get coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupons'
    });
  }
});

router.post('/coupons', async (req, res) => {
  try {
    const coupon = new Coupon(req.body);
    await coupon.save();

    res.status(201).json({
      success: true,
      data: coupon,
      message: 'Coupon created successfully'
    });
  } catch (error) {
    logger.error('Create coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating coupon'
    });
  }
});

router.put('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      data: coupon,
      message: 'Coupon updated successfully'
    });
  } catch (error) {
    logger.error('Update coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating coupon'
    });
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByIdAndDelete(id);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    logger.error('Delete coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting coupon'
    });
  }
});

// ==================== ANALYTICS ====================
router.get('/analytics/sales', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate;
    const endDate = new Date();
    
    switch (period) {
      case 'week':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(endDate.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          orderStatus: { $in: ['delivered'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          totalSales: { $sum: '$total' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Additional breakdown by paymentStatus
    const paymentBreakdown = await Order.aggregate([
      {
        $match: { createdAt: { $gte: startDate, $lte: endDate } }
      },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          total: { $sum: '$total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        timeseries: salesData,
        paymentStatus: paymentBreakdown
      }
    });
  } catch (error) {
    logger.error('Sales analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sales analytics'
    });
  }
});

router.get('/analytics/products', async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' }
    ]);

    res.json({
      success: true,
      data: topProducts
    });
  } catch (error) {
    logger.error('Product analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product analytics'
    });
  }
});

// ==================== EDIT PRODUCT ====================
router.get('/products/edit/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    res.json({
      success: true,
      data: { product }
    });
  } catch (error) {
    logger.error('Get product for edit error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product'
    });
  }
});

router.put('/products/edit/:id', async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      image,
      images,
      sizes,
      ingredients,
      nutrition,
      featured
    } = req.body;

    // Validate required fields
    if (!name || !description || !category || !image || !sizes || !ingredients) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate sizes array
    if (!Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one size is required'
      });
    }

    // Validate each size
    for (const size of sizes) {
      if (!size.size || !size.price || size.stock === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Each size must have size, price, and stock'
        });
      }
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Update product
    product.name = name;
    product.description = description;
    product.category = category;
    product.image = image;
    product.images = images || [];
    product.sizes = sizes;
    product.ingredients = ingredients;
    product.nutrition = nutrition || {};
    product.featured = featured || false;

    await product.save();

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });
  } catch (error) {
    logger.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product'
    });
  }
});

module.exports = router; 