// backend/server.js - SIRF RESET ROUTE ADD KIYA + RETRY LOGIC
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');

dotenv.config();

const app = express();

// ============================================
// CONNECT TO MONGODB WITH RETRY
// ============================================
const connectWithRetry = async (retries = 5, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await connectDB();
            console.log(`✅ MongoDB connected successfully`);
            return;
        } catch (error) {
            console.error(`❌ Connection attempt ${i + 1} failed: ${error.message}`);
            if (i === retries - 1) {
                console.error('❌ All retry attempts failed');
                throw error;
            }
            console.log(`⏳ Retrying in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Use retry logic
connectWithRetry().catch(err => {
    console.error('❌ Failed to connect to MongoDB:', err.message);
});

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
// FRONTEND ROUTES - Reset route pehle define karo
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

// 404 handler - send index.html for all other routes
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