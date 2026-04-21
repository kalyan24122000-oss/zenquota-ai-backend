const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { getOne, runSQL } = require('../config/db');
const { getAIQuote } = require('../utils/openrouter');

const router = express.Router();

/**
 * GET /api/get-quote
 */
router.get('/get-quote', authenticateUser, async (req, res) => {
  try {
    const user = getOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Reset daily count if new day
    if (user.last_reset_date !== today) {
      runSQL('UPDATE users SET daily_quote_count = 0, last_reset_date = ? WHERE id = ?', [today, user.id]);
      user.daily_quote_count = 0;
      user.last_reset_date = today;
    }

    const FREE_DAILY_LIMIT = 3;
    const totalAvailable = FREE_DAILY_LIMIT + user.bonus_quotes;
    const totalUsed = user.daily_quote_count;

    if (totalUsed >= totalAvailable) {
      return res.status(429).json({
        success: false,
        message: 'Daily limit reached',
        limitReached: true,
        daily_used: totalUsed,
        daily_limit: FREE_DAILY_LIMIT,
        bonus_remaining: Math.max(0, user.bonus_quotes - Math.max(0, totalUsed - FREE_DAILY_LIMIT)),
        wallet_balance: user.wallet_balance
      });
    }

    const quote = await getAIQuote();

    runSQL('UPDATE users SET daily_quote_count = daily_quote_count + 1 WHERE id = ?', [user.id]);

    const newCount = totalUsed + 1;
    const bonusUsed = Math.max(0, newCount - FREE_DAILY_LIMIT);
    const bonusRemaining = Math.max(0, user.bonus_quotes - bonusUsed);

    res.json({
      success: true,
      quote: quote.quote,
      author: quote.author,
      daily_used: newCount,
      daily_limit: FREE_DAILY_LIMIT,
      bonus_remaining: bonusRemaining,
      total_available: totalAvailable,
      wallet_balance: user.wallet_balance
    });
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quote' });
  }
});

/**
 * GET /api/quote-status
 */
router.get('/quote-status', authenticateUser, (req, res) => {
  try {
    const user = getOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const today = new Date().toISOString().split('T')[0];

    if (user.last_reset_date !== today) {
      runSQL('UPDATE users SET daily_quote_count = 0, last_reset_date = ? WHERE id = ?', [today, user.id]);
      user.daily_quote_count = 0;
    }

    const FREE_DAILY_LIMIT = 3;

    res.json({
      success: true,
      daily_used: user.daily_quote_count,
      daily_limit: FREE_DAILY_LIMIT,
      bonus_remaining: user.bonus_quotes,
      total_available: FREE_DAILY_LIMIT + user.bonus_quotes,
      limitReached: user.daily_quote_count >= (FREE_DAILY_LIMIT + user.bonus_quotes),
      wallet_balance: user.wallet_balance
    });
  } catch (error) {
    console.error('Quote status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
