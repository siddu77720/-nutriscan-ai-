// backend/config/db.js - COMPLETE FIX
const mongoose = require('mongoose');
const dns = require('dns');

// Fix querySrv ENOTFOUND when local ISP/router DNS fails to resolve MongoDB Atlas SRV records
try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (err) {
    // Some serverless environments restrict setting custom DNS
}

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

// ✅ CONNECTION STATE CHECK
const isConnected = () => {
    return mongoose.connection.readyState === 1;
};

// ✅ CONNECT WITH RETRY
const connectDB = async (retries = 5, delay = 5000) => {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
        try {
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

// ✅ Event listeners
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