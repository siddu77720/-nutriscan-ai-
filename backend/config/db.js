// backend/config/db.js - PERMANENT FIX
const mongoose = require('mongoose');

// ✅ Mongoose connection options
const connectionOptions = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    family: 4,
    maxPoolSize: 20,
    minPoolSize: 5,
    retryWrites: true,
    retryReads: true,
    connectTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000,
};

// ✅ Connection state check
const isConnected = () => mongoose.connection.readyState === 1;

// ✅ Connect with retry
const connectDB = async (retries = 5, delay = 5000) => {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
        try {
            // If already connected, return
            if (isConnected()) {
                console.log('✅ MongoDB already connected');
                return mongoose.connection;
            }
            
            const conn = await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
            console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
            console.log(`📊 Connection pool size: ${conn.connection.options.maxPoolSize}`);
            return conn;
            
        } catch (error) {
            lastError = error;
            console.error(`❌ Connection attempt ${i + 1} failed: ${error.message}`);
            
            if (i < retries - 1) {
                console.log(`⏳ Retrying in ${delay/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    console.error(`❌ All ${retries} retry attempts failed`);
    throw lastError;
};

// ✅ Event listeners (once)
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

module.exports = { connectDB, isConnected };