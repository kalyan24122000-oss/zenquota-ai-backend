/**
 * ZenQuota AI — Admin Auth
 */

const API_BASE = window.location.origin + '/api';

// Check if already logged in
(function checkAuth() {
  const token = localStorage.getItem('adminToken');
  if (token) {
    window.location.href = 'dashboard.html';
  }
})();

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorMsg = document.getElementById('errorMsg');
  const loginBtn = document.getElementById('loginBtn');

  errorMsg.textContent = '';
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUsername', data.username);
      window.location.href = 'dashboard.html';
    } else {
      errorMsg.textContent = data.message || 'Login failed';
    }
  } catch (err) {
    errorMsg.textContent = 'Connection error. Is the server running?';
    console.error('Login error:', err);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In to Dashboard';
  }
});
