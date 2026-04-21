const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { authenticateAdmin } = require('../middleware/auth');
const { getOne, getAll, runSQL } = require('../config/db');

const router = express.Router();

/**
 * POST /api/admin/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const admin = getOne('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ success: true, token, username: admin.username });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/users
 */
router.get('/users', authenticateAdmin, (req, res) => {
  try {
    const users = getAll(`
      SELECT id, email, wallet_balance, daily_quote_count, bonus_quotes,
             last_reset_date, is_verified, fingerprint_enabled, created_at
      FROM users ORDER BY created_at DESC
    `);

    res.json({ success: true, users, total: users.length });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/recharge
 */
router.post('/recharge', authenticateAdmin, (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid user ID and amount required' });
    }

    const user = getOne('SELECT id, email, wallet_balance FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    runSQL('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, userId]);
    runSQL(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [userId, 'credit', amount, `Admin wallet recharge of ₹${amount}`]
    );

    const updated = getOne('SELECT wallet_balance FROM users WHERE id = ?', [userId]);

    res.json({
      success: true,
      message: `₹${amount} added to ${user.email}'s wallet`,
      new_balance: updated.wallet_balance
    });
  } catch (error) {
    console.error('Admin recharge error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/generate-code
 */
router.post('/generate-code', authenticateAdmin, (req, res) => {
  try {
    const { value, userId } = req.body;
    const quoteValue = value || 10;

    const code = 'ZQ-' + uuidv4().substring(0, 8).toUpperCase();

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const expiryStr = expiryDate.toISOString().split('T')[0];

    runSQL(
      'INSERT INTO redeem_codes (code, user_id, value, status, expiry_date) VALUES (?, ?, ?, ?, ?)',
      [code, userId || null, quoteValue, 'unused', expiryStr]
    );

    res.json({
      success: true,
      message: 'Redeem code generated',
      code,
      value: quoteValue,
      expiry_date: expiryStr
    });
  } catch (error) {
    console.error('Admin generate code error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/stats
 */
router.get('/stats', authenticateAdmin, (req, res) => {
  try {
    const totalUsers = getOne('SELECT COUNT(*) as count FROM users')?.count || 0;
    const verifiedUsers = getOne('SELECT COUNT(*) as count FROM users WHERE is_verified = 1')?.count || 0;
    const totalWalletBalance = getOne('SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users')?.total || 0;
    const totalRedeemCodes = getOne('SELECT COUNT(*) as count FROM redeem_codes')?.count || 0;
    const usedCodes = getOne("SELECT COUNT(*) as count FROM redeem_codes WHERE status = 'used'")?.count || 0;
    const unusedCodes = getOne("SELECT COUNT(*) as count FROM redeem_codes WHERE status = 'unused'")?.count || 0;

    const today = new Date().toISOString().split('T')[0];
    const quotesToday = getOne(
      'SELECT COALESCE(SUM(daily_quote_count), 0) as total FROM users WHERE last_reset_date = ?',
      [today]
    )?.total || 0;

    const totalTransactions = getOne('SELECT COUNT(*) as count FROM transactions')?.count || 0;
    const recentTransactions = getAll(
      `SELECT t.*, u.email FROM transactions t
       LEFT JOIN users u ON t.user_id = u.id
       ORDER BY t.created_at DESC LIMIT 10`
    );

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        totalWalletBalance,
        totalRedeemCodes,
        usedCodes,
        unusedCodes,
        quotesToday,
        totalTransactions,
        recentTransactions
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/admin/change-password
 */
router.put('/change-password', authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const admin = getOne('SELECT * FROM admins WHERE id = ?', [req.adminId]);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    runSQL('UPDATE admins SET password = ? WHERE id = ?', [hashedNewPassword, req.adminId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Admin change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/codes
 */
router.get('/codes', authenticateAdmin, (req, res) => {
  try {
    const codes = getAll(`
      SELECT r.*, u.email as user_email
      FROM redeem_codes r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `);

    res.json({ success: true, codes, total: codes.length });
  } catch (error) {
    console.error('Admin get codes error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
