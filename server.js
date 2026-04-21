require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve admin panel static files
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Health check (available before DB init)
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'ZenQuota AI Backend is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Root redirect to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Initialize database then start server
async function startServer() {
  try {
    await initDB();
    console.log('✅ Database ready');

    // API Routes (loaded after DB init)
    const authRoutes = require('./routes/auth');
    const quoteRoutes = require('./routes/quotes');
    const walletRoutes = require('./routes/wallet');
    const adminRoutes = require('./routes/admin');

    app.use('/api', authRoutes);
    app.use('/api', quoteRoutes);
    app.use('/api', walletRoutes);
    app.use('/api/admin', adminRoutes);

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
    });

    // Error handler
    app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    });

    app.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════════╗
  ║         ZenQuota AI Backend              ║
  ║──────────────────────────────────────────║
  ║  🚀 Server running on port ${PORT}          ║
  ║  📱 API: http://localhost:${PORT}/api       ║
  ║  🛠️  Admin: http://localhost:${PORT}/admin   ║
  ║  ❤️  Health: http://localhost:${PORT}/api/health ║
  ╚══════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
