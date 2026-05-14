const mongoose = require('mongoose');

let connectionPromise = null;

const connect = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connectionPromise) return connectionPromise;

  try {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await connectionPromise;
    console.log('MongoDB connected:', mongoose.connection.host);
    return mongoose;
  } catch (err) {
    connectionPromise = null;
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
};

mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

module.exports = { connect, mongoose };
