// backend/server.js - With connection check middleware
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { connectDB, isConnected } = require('./config/db');

dotenv.config();

const app = express();

// ============================================
// CONNECT TO MONGODB ON STARTUP
// ============================================
connectDB().catch(err => {
    console.error('❌ Startup MongoDB Error:', err.message);
});

// ============================================
// ✅ MIDDLEWARE: Check DB connection before each request
// ============================================
const ensureDbConnection = async (req, res, next) => {
    try {
        if (!isConnected()) {
            console.log('⚠️ DB disconnected, reconnecting...');
            await connectDB(3, 2000);
        }
        next();
    } catch (error) {
        console.error('❌ DB connection failed:', error.message);
        res.status(503).json({
            success: false,
            error: 'Service temporarily unavailable. Please try again.'
        });
    }
};

// Apply to all API routes
app.use('/api', ensureDbConnection);

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// ROUTES
// ============================================
const authRoutes = require('./routes/authRoutes');
const scanRoutes = require('./routes/scanRoutes');
const userRoutes = require('./routes/userRoutes');
const historyRoutes = require('./routes/historyRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/user', userRoutes);
app.use('/api/history', historyRoutes);

// ============================================
// FRONTEND ROUTES
// ============================================
app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/reset-password/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 404 handler
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

module.exports = app;