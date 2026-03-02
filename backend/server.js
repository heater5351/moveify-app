// Moveify Backend Server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const invitationRoutes = require('./routes/invitations');
const patientRoutes = require('./routes/patients');
const programRoutes = require('./routes/programs');
const checkInRoutes = require('./routes/check-ins');
const exerciseRoutes = require('./routes/exercises');
const educationRoutes = require('./routes/education');
const blockRoutes = require('./routes/blocks');

// Import database init
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet());

// CORS Configuration
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN || (isProduction ? undefined : 'http://localhost:5173');

if (isProduction && !corsOrigin) {
  console.warn('WARNING: CORS_ORIGIN not set in production. CORS will reject all cross-origin requests.');
}

const corsOptions = {
  origin: corsOrigin || false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting — auth endpoints (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// Rate limiting — general API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/check-ins', checkInRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/education', educationRoutes);
app.use('/api/blocks', blockRoutes);

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
  // Start server first so Cloud Run health checks pass
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (process.env.CORS_ORIGIN) {
      console.log(`CORS origin: ${process.env.CORS_ORIGIN}`);
    }
  });

  // Initialize database tables (retry for Cloud SQL proxy startup)
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await initDatabase();
      console.log('Database initialized');
      break;
    } catch (error) {
      console.error(`Database init attempt ${attempt}/${maxRetries} failed:`, error.message);
      if (attempt === maxRetries) {
        console.error('All database init attempts failed. Server is running but DB is not ready.');
      } else {
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  }
}

startServer();
