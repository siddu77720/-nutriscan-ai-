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
// CONNECT TO MONGODB
// ============================================
connectDB().catch(err => {
    console.error('MongoDB connection error:', err);
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// STATIC FILES
// ============================================
app.use(express.static(path.join(__dirname, '../frontend')));

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
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/reset-password/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

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
module.exports = app;