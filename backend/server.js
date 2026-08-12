// backend/server.js - VERCEL DEPLOYMENT READY
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

const app = express();

// ============================================
// CONNECT TO MONGODB (Only on server start)
// ============================================
if (process.env.NODE_ENV !== 'production') {
  connectDB();
} else {
  // Production: Connect with retry
  connectDB().catch(err => console.error('MongoDB connection error:', err));
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// STATIC FILES - For production
// ============================================
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend')));
}

// ============================================
// IMPORT ROUTES
// ============================================
const authRoutes = require('./routes/authRoutes');
const scanRoutes = require('./routes/scanRoutes');
const userRoutes = require('./routes/userRoutes');
const historyRoutes = require('./routes/historyRoutes');

// ============================================
// USE ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/user', userRoutes);
app.use('/api/history', historyRoutes);

// ============================================
// FRONTEND ROUTES
// ============================================
if (process.env.NODE_ENV === 'production') {
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });

  app.get('/reset-password/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });

  // 404 Handler - SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
} else {
  // Development - serve from frontend folder
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });

  app.get('/reset-password/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
}

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.message);
  console.error('Stack:', err.stack);
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ============================================
// EXPORT FOR VERCEL
// ============================================
if (process.env.NODE_ENV === 'production') {
  // Vercel expects the app to be exported
  module.exports = app;
} else {
  // Development - Start server normally
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log('=========================================');
    console.log('🍎 NutriScan AI Server Started');
    console.log('=========================================');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
    console.log(`📷 Scan API: http://localhost:${PORT}/api/scan`);
    console.log('=========================================');
  });
}

// For Vercel, export the app
module.exports = app;