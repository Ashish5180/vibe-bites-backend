const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logger } = require('../utils/logger');

// Protect routes - require authentication
// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;
    console.log('PROTECT MIDDLEWARE: COOKIES:', req.cookies);

    // Prefer cookie token, fallback to Authorization header
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
      console.log('PROTECT MIDDLEWARE: TOKEN FROM COOKIE:', token);
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('PROTECT MIDDLEWARE: TOKEN FROM AUTH HEADER:', token);
    }

    // Check if token exists
    if (!token) {
      console.log('PROTECT MIDDLEWARE: NO TOKEN FOUND');
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('PROTECT MIDDLEWARE: DECODED TOKEN:', decoded);
    // Get user from token
    const user = await User.findById(decoded.id).select('-password');
    console.log('PROTECT MIDDLEWARE: USER FROM TOKEN:', user);
    if (!user) {
      console.log('PROTECT MIDDLEWARE: USER NOT FOUND');
      return res.status(401).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (!user.isActive) {
      console.log('PROTECT MIDDLEWARE: USER NOT ACTIVE');
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Protect middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};

// Admin only routes
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
};

// Check if user is verified
const requireVerification = (req, res, next) => {
  if (req.user && req.user.isEmailVerified) {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Email verification required.'
    });
  }
};

module.exports = {
  protect,
  admin,
  requireVerification
};