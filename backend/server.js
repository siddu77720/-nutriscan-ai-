// backend/server.js - FIXED FOR EXPRESS 5
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');

dotenv.config();

const app = express();

// ============================================
// CONNECT TO MONGODB
// ============================================
connectDB().catch(err => {
    console.error('❌ MongoDB Error:', err.message);
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// IMPORT ROUTES
// ============================================
const authRoutes = require('./routes/authRoutes');
const scanRoutes = require('./routes/scanRoutes');
const userRoutes = require('./routes/userRoutes');
const historyRoutes = require('./routes/historyRoutes');

// ============================================
// USE ROUTES - API ROUTES PEHLE
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/user', userRoutes);
app.use('/api/history', historyRoutes);

// ============================================
// SERVE FRONTEND STATIC FILES
// ============================================
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// FRONTEND ROUTES - EXPRESS 5 COMPATIBLE
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/reset-password/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// FIXED: Express 5 compatible wildcard route
app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================
// EXPORT FOR VERCEL
// ============================================
module.exports = app;