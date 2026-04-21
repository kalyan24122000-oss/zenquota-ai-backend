const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getOne, runSQL } = require('../config/db');
const { sendVerificationEmail } = require('../utils/email');

const router = express.Router();

/**
 * POST /api/signup
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const existingUser = getOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = uuidv4();
    const today = new Date().toISOString().split('T')[0];

    const result = runSQL(
      'INSERT INTO users (email, password, verification_token, last_reset_date) VALUES (?, ?, ?, ?)',
      [email.toLowerCase(), hashedPassword, verificationToken, today]
    );

    const emailResult = await sendVerificationEmail(email.toLowerCase(), verificationToken);

    const response = {
      success: true,
      message: emailResult.emailSent
        ? 'Account created. Please check your email to verify your account.'
        : 'Account created. Use the verification token below to verify.',
      userId: result.lastInsertRowid
    };
    // If email couldn't be sent, include token directly so user can still verify
    if (emailResult.fallback) {
      response.verificationToken = verificationToken;
      response.fallbackMode = true;
    }
    res.status(201).json(response);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Server error during signup' });
  }
});

/**
 * POST /api/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = getOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: 'Email not verified. Please check your inbox.',
        needsVerification: true
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    if (!user.fingerprint_enabled) {
      runSQL('UPDATE users SET fingerprint_enabled = 1 WHERE id = ?', [user.id]);
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        wallet_balance: user.wallet_balance,
        fingerprint_enabled: true
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

/**
 * POST /api/verify-email
 */
router.post('/verify-email', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token required' });
    }

    const user = getOne('SELECT id, is_verified FROM users WHERE verification_token = ?', [token]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Invalid verification token' });
    }
    if (user.is_verified) {
      return res.json({ success: true, message: 'Email already verified' });
    }

    runSQL('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?', [user.id]);

    res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Server error during verification' });
  }
});

// GET handler for email link clicks
router.get('/verify-email', (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('<h1>Invalid verification link</h1>');
    }

    const user = getOne('SELECT id, is_verified FROM users WHERE verification_token = ?', [token]);
    if (!user) {
      return res.send(`
        <html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#0a0a1a;color:#fff;">
          <div style="text-align:center;"><h1 style="color:#ef4444;">❌ Invalid Token</h1><p>This verification link is invalid or has expired.</p></div>
        </body></html>
      `);
    }

    if (!user.is_verified) {
      runSQL('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?', [user.id]);
    }

    res.send(`
      <html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#0a0a1a;color:#fff;">
        <div style="text-align:center;"><h1 style="color:#22c55e;">✅ Email Verified!</h1><p style="color:#d1d5db;">Your email has been verified. You can now log in to ZenQuota AI.</p></div>
      </body></html>
    `);
  } catch (error) {
    console.error('Verify email GET error:', error);
    res.status(500).send('<h1>Server error</h1>');
  }
});

/**
 * POST /api/resend-verification
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = getOne('SELECT id, is_verified, verification_token FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.is_verified) {
      return res.json({ success: true, message: 'Email is already verified' });
    }

    let token = user.verification_token;
    if (!token) {
      token = uuidv4();
      runSQL('UPDATE users SET verification_token = ? WHERE id = ?', [token, user.id]);
    }

    const emailResult = await sendVerificationEmail(email.toLowerCase(), token);

    const response = {
      success: true,
      message: emailResult.emailSent ? 'Verification email sent' : 'Use the token below to verify.'
    };
    if (emailResult.fallback) {
      response.verificationToken = token;
      response.fallbackMode = true;
    }
    res.json(response);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
