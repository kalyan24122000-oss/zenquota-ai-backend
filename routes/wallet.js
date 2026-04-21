const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateUser } = require('../middleware/auth');
const { getOne, getAll, runSQL } = require('../config/db');
const { sendRedeemCodeEmail } = require('../utils/email');

const router = express.Router();

/**
 * GET /api/wallet
 */
router.get('/wallet', authenticateUser, (req, res) => {
  try {
    const user = getOne('SELECT wallet_balance, bonus_quotes FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const transactions = getAll(
      'SELECT type, amount, description, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.userId]
    );

    const redeemCodes = getAll(
      'SELECT code, value, status, created_at, expiry_date FROM redeem_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
      [req.userId]
    );

    res.json({
      success: true,
      wallet_balance: user.wallet_balance,
      bonus_quotes: user.bonus_quotes,
      transactions,
      redeem_codes: redeemCodes
    });
  } catch (error) {
    console.error('Wallet error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/buy-quotes
 */
router.post('/buy-quotes', authenticateUser, async (req, res) => {
  try {
    const user = getOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const QUOTE_PRICE = 10;
    const QUOTE_VALUE = 10;

    if (user.wallet_balance < QUOTE_PRICE) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. You need ₹${QUOTE_PRICE} but have ₹${user.wallet_balance}`,
        wallet_balance: user.wallet_balance
      });
    }

    const code = 'ZQ-' + uuidv4().substring(0, 8).toUpperCase();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const expiryStr = expiryDate.toISOString().split('T')[0];

    // Deduct from wallet
    runSQL('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [QUOTE_PRICE, user.id]);

    // Create redeem code
    runSQL(
      'INSERT INTO redeem_codes (code, user_id, value, status, expiry_date) VALUES (?, ?, ?, ?, ?)',
      [code, user.id, QUOTE_VALUE, 'unused', expiryStr]
    );

    // Log transaction
    runSQL(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [user.id, 'debit', QUOTE_PRICE, `Purchased ${QUOTE_VALUE} quotes. Code: ${code}`]
    );

    // Send email
    const emailResult = await sendRedeemCodeEmail(user.email, code, QUOTE_VALUE);

    const updatedUser = getOne('SELECT wallet_balance FROM users WHERE id = ?', [user.id]);

    res.json({
      success: true,
      message: `${QUOTE_VALUE} quotes purchased! Redeem code sent to your email.`,
      code: code,
      wallet_balance: updatedUser.wallet_balance,
      expiry_date: expiryStr,
      emailSent: emailResult.success,
      demo: emailResult.demo || false
    });
  } catch (error) {
    console.error('Buy quotes error:', error);
    res.status(500).json({ success: false, message: 'Server error during purchase' });
  }
});

/**
 * POST /api/redeem-code
 */
router.post('/redeem-code', authenticateUser, (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ success: false, message: 'Redeem code is required' });
    }

    const redeemCode = getOne('SELECT * FROM redeem_codes WHERE code = ?', [code.trim().toUpperCase()]);

    if (!redeemCode) {
      return res.status(404).json({ success: false, message: 'Invalid redeem code' });
    }
    if (redeemCode.status === 'used') {
      return res.status(400).json({ success: false, message: 'This code has already been used' });
    }

    // Check expiry
    if (redeemCode.expiry_date) {
      const today = new Date().toISOString().split('T')[0];
      if (today > redeemCode.expiry_date) {
        return res.status(400).json({ success: false, message: 'This code has expired' });
      }
    }

    // Add bonus quotes
    runSQL('UPDATE users SET bonus_quotes = bonus_quotes + ? WHERE id = ?', [redeemCode.value, req.userId]);

    // Mark code as used
    runSQL('UPDATE redeem_codes SET status = ?, user_id = ? WHERE id = ?', ['used', req.userId, redeemCode.id]);

    // Log transaction
    runSQL(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [req.userId, 'credit', redeemCode.value, `Redeemed code ${code} for ${redeemCode.value} quotes`]
    );

    const updatedUser = getOne('SELECT bonus_quotes FROM users WHERE id = ?', [req.userId]);

    res.json({
      success: true,
      message: `${redeemCode.value} bonus quotes added to your account!`,
      quotes_added: redeemCode.value,
      total_bonus_quotes: updatedUser.bonus_quotes
    });
  } catch (error) {
    console.error('Redeem code error:', error);
    res.status(500).json({ success: false, message: 'Server error during redemption' });
  }
});

module.exports = router;
