// Moveify Backend Server
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const invitationRoutes = require('./routes/invitations');
const patientRoutes = require('./routes/patients');
const programRoutes = require('./routes/programs');
const checkInRoutes = require('./routes/check-ins');

// Import database init
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration - whitelist frontend in production
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/check-ins', checkInRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Moveify Backend is running!' });
});

// Health check route (used by Railway)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware - must be last
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error('Error:', err.name, err.message);
  console.error('Stack:', err.stack);
  setTimeout(() => process.exit(1), 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error('Error:', err);
  setTimeout(() => process.exit(1), 1000);
});

// Graceful shutdown handler
let server;
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('Process terminated');
    });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database tables
    await initDatabase();
    console.log('Database initialized');

    // Start server
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (process.env.CORS_ORIGIN) {
        console.log(`CORS origin: ${process.env.CORS_ORIGIN}`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
