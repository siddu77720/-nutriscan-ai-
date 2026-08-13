// backend/config/db.js - MONGODB ATLAS READY WITH RETRY
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,  // 10s se 30s
            socketTimeoutMS: 60000,           // 45s se 60s
            family: 4,                        // IPv4 force
            maxPoolSize: 20,                 // Connection pool
            minPoolSize: 5,
            retryWrites: true,
            retryReads: true,
            connectTimeoutMS: 30000,
            heartbeatFrequencyMS: 10000,
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Connection pool size: ${conn.connection.options.maxPoolSize}`);
        
        // Connection event listeners for debugging
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected, attempting to reconnect...');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });
        
        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Error: ${error.message}`);
        throw error;
    }
};

module.exports = connectDB;