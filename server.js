// Load environment variables first
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const path = require('path');
const config = require('./config/config');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const couponRoutes = require('./routes/coupons');
const paymentRoutes = require('./routes/payments');
const reviewRoutes = require('./routes/reviews');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const adminProductCreateRoute = require('./routes/adminProducts');
const wishlistRoutes = require('./routes/wishlist');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./utils/logger');
const { sanitizeRequest } = require('./utils/validation');

const app = express();

// Trust proxy if behind a reverse proxy (for rate limiting)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://vibebitstest-env.eba-ubvupniq.ap-south-1.elasticbeanstalk.com',
      'https://vibe-bites-frontend.vercel.app',
      'https://www.vibebites.shop',
      'https://vibe-bites-backend.onrender.com',
      'https://vibebites.shop'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control']
}));

// Rate limiting with configuration
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.general,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.auth,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// Stripe webhook must access the raw body, so we apply raw body parser just for that route BEFORE json parser
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Input sanitization middleware
app.use((req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeRequest(req.body);
    }
    if (req.query) {
      req.query = sanitizeRequest(req.query);
    }
    if (req.params) {
      req.params = sanitizeRequest(req.params);
    }
  } catch (error) {
    logger.error('Input sanitization error:', error);
    return res.status(400).json({
      success: false,
      error: 'Invalid input data'
    });
  }
  next();
});

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'VIBE BITES API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/products/create', adminProductCreateRoute);
app.use('/api/wishlist', wishlistRoutes);

// Catch all handler for undefined routes
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use(errorHandler);

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    logger.warn('Continuing without MongoDB connection...');
    // Don't exit - let the app run without DB
  }
};

// Start server
const startServer = async () => {
  await connectDB();

  // Seed default coupon if in development
  if (process.env.NODE_ENV !== 'production') {
    try {
      const Coupon = require('./models/Coupon');
      const code = 'VIBE10';
      const existing = await Coupon.findOne({ code });
      if (!existing) {
        const now = new Date();
        await Coupon.create({
          code,
          description: '10% off your order',
          discount: 10,
          type: 'percentage',
          categories: [],
          minOrderAmount: 0,
          maxDiscount: 100,
          validFrom: now,
          validUntil: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
          isActive: true,
          isFirstTimeOnly: false
        });
        logger.info('Seeded default coupon VIBE10');
      } else {
        logger.info('Default coupon VIBE10 already present');
      }
    } catch (e) {
      logger.error('Error seeding default coupon:', e);
    }
  }

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} in ${process.env.NODE_ENV || 'development'} mode`);
  });
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Rejection:', err);
  // Don't exit - log and continue
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  // Don't exit - log and continue
});

startServer();

module.exports = app;