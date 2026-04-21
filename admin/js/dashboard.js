/**
 * ZenQuota AI — Admin Dashboard Logic
 */

const API_BASE = window.location.origin + '/api';
const token = localStorage.getItem('adminToken');

// Auth guard
if (!token) {
  window.location.href = 'index.html';
}

// Set admin name
document.getElementById('adminName').textContent = localStorage.getItem('adminUsername') || 'admin';

// ─── API Helper ───
async function apiCall(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, opts);

  if (res.status === 401) {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    window.location.href = 'index.html';
    return null;
  }

  return res.json();
}

// ─── Toast Notifications ───
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Navigation ───
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset.section;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    // Update sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${section}`).classList.add('active');

    // Load data for the section
    loadSectionData(section);
  });
});

function loadSectionData(section) {
  switch (section) {
    case 'overview': loadStats(); break;
    case 'users': loadUsers(); break;
    case 'recharge': loadRechargeUsers(); break;
    case 'requests': loadRechargeRequests(); break;
    case 'codes': loadCodes(); break;
  }
}

// ─── Logout ───
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUsername');
  window.location.href = 'index.html';
});

// ─── Load Stats ───
async function loadStats() {
  const data = await apiCall('/admin/stats');
  if (!data || !data.success) return;

  const s = data.stats;
  document.getElementById('statTotalUsers').textContent = s.totalUsers;
  document.getElementById('statVerifiedUsers').textContent = s.verifiedUsers;
  document.getElementById('statTotalBalance').textContent = `₹${s.totalWalletBalance}`;
  document.getElementById('statQuotesToday').textContent = s.quotesToday;
  document.getElementById('statTotalCodes').textContent = s.totalRedeemCodes;
  document.getElementById('statTransactions').textContent = s.totalTransactions;

  // Recent transactions
  const tbody = document.getElementById('recentTransactions');
  if (s.recentTransactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:32px;color:var(--text-muted);">No transactions yet</td></tr>';
    return;
  }

  tbody.innerHTML = s.recentTransactions.map(t => `
    <tr>
      <td>${t.email || 'N/A'}</td>
      <td><span class="badge ${t.type === 'credit' ? 'badge-success' : 'badge-warning'}">${t.type}</span></td>
      <td>${t.type === 'credit' ? '+' : '-'}${t.amount}</td>
      <td>${t.description || '-'}</td>
      <td>${new Date(t.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('');
}

// ─── Load Users ───
let allUsers = [];

async function loadUsers() {
  const data = await apiCall('/admin/users');
  if (!data || !data.success) return;

  allUsers = data.users;
  renderUsers(allUsers);
}

function renderUsers(users) {
  const tbody = document.getElementById('usersTable');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:32px;color:var(--text-muted);">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${u.email}</td>
      <td>₹${u.wallet_balance}</td>
      <td>${u.bonus_quotes}</td>
      <td>${u.daily_quote_count}/3</td>
      <td>
        ${u.is_verified
          ? '<span class="badge badge-success">Verified</span>'
          : '<span class="badge badge-warning">Unverified</span>'
        }
      </td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-success btn-sm" onclick="quickRecharge(${u.id}, '${u.email}')">💰 Recharge</button>
      </td>
    </tr>
  `).join('');
}

// User search
document.getElementById('userSearch').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = allUsers.filter(u => u.email.toLowerCase().includes(query));
  renderUsers(filtered);
});

// ─── Recharge ───
async function loadRechargeUsers() {
  const data = await apiCall('/admin/users');
  if (!data || !data.success) return;

  const tbody = document.getElementById('rechargeUsersTable');
  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${u.email}</td>
      <td>₹${u.wallet_balance}</td>
      <td>
        <button class="btn btn-success btn-sm" onclick="quickRecharge(${u.id}, '${u.email}')">
          + Recharge
        </button>
      </td>
    </tr>
  `).join('');
}

function quickRecharge(userId, email) {
  document.getElementById('rechargeUserId').value = userId;
  document.getElementById('rechargeAmount').value = '';
  document.getElementById('rechargeAmount').focus();

  // Switch to recharge section
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-recharge').classList.add('active');
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-recharge').classList.add('active');

  showToast(`Recharging wallet for ${email} (ID: ${userId})`, 'info');
}

document.getElementById('rechargeBtn').addEventListener('click', async () => {
  const userId = parseInt(document.getElementById('rechargeUserId').value);
  const amount = parseFloat(document.getElementById('rechargeAmount').value);

  if (!userId || !amount || amount <= 0) {
    showToast('Please enter valid user ID and amount', 'error');
    return;
  }

  const btn = document.getElementById('rechargeBtn');
  btn.disabled = true;

  const data = await apiCall('/admin/recharge', 'POST', { userId, amount });

  if (data && data.success) {
    showToast(data.message, 'success');
    document.getElementById('rechargeUserId').value = '';
    document.getElementById('rechargeAmount').value = '';
    loadRechargeUsers();
  } else {
    showToast(data?.message || 'Recharge failed', 'error');
  }

  btn.disabled = false;
});

// ─── Recharge Requests ───
async function loadRechargeRequests() {
  const data = await apiCall('/admin/recharge-requests');
  if (!data || !data.success) return;

  const tbody = document.getElementById('requestsTable');
  if (data.requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:32px;color:var(--text-muted);">No pending requests</td></tr>';
    return;
  }

  tbody.innerHTML = data.requests.map(r => `
    <tr>
      <td>#${r.id}</td>
      <td>${r.user_id}</td>
      <td>${r.user_email || 'N/A'}</td>
      <td style="font-weight:bold;color:var(--accent-green);">₹${r.amount}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td>
        <button class="btn btn-success btn-sm" onclick="processRequest(${r.id}, 'approve')" style="margin-right:8px;">✅ Approve</button>
        <button class="btn btn-secondary btn-sm" onclick="processRequest(${r.id}, 'reject')">❌ Reject</button>
      </td>
    </tr>
  `).join('');
}

async function processRequest(requestId, action) {
  if (!confirm(`Are you sure you want to ${action} request #${requestId}?`)) return;

  const data = await apiCall('/admin/approve-recharge', 'POST', { requestId, action });
  if (data && data.success) {
    showToast(data.message, 'success');
    loadRechargeRequests();
  } else {
    showToast(data?.message || `Failed to ${action} request`, 'error');
  }
}

// ─── Redeem Codes ───
async function loadCodes() {
  const data = await apiCall('/admin/codes');
  if (!data || !data.success) return;

  const tbody = document.getElementById('codesTable');
  if (data.codes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:32px;color:var(--text-muted);">No codes generated yet</td></tr>';
    return;
  }

  tbody.innerHTML = data.codes.map(c => `
    <tr>
      <td><code style="color:var(--accent-purple);font-weight:600;">${c.code}</code></td>
      <td>${c.value} quotes</td>
      <td>${c.user_email || c.user_id || 'General'}</td>
      <td>
        <span class="badge ${c.status === 'used' ? 'badge-danger' : 'badge-success'}">
          ${c.status}
        </span>
      </td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
      <td>${c.expiry_date || 'N/A'}</td>
    </tr>
  `).join('');
}

document.getElementById('generateCodeBtn').addEventListener('click', async () => {
  const value = parseInt(document.getElementById('codeValue').value) || 10;
  const userId = document.getElementById('codeUserId').value ? parseInt(document.getElementById('codeUserId').value) : null;

  const btn = document.getElementById('generateCodeBtn');
  btn.disabled = true;

  const body = { value };
  if (userId) body.userId = userId;

  const data = await apiCall('/admin/generate-code', 'POST', body);

  if (data && data.success) {
    document.getElementById('generatedCode').textContent = data.code;
    document.getElementById('generatedCodeDisplay').classList.remove('hidden');
    showToast(`Code generated: ${data.code}`, 'success');
    loadCodes();
  } else {
    showToast(data?.message || 'Failed to generate code', 'error');
  }

  btn.disabled = false;
});

// ─── Change Password ───
document.getElementById('changePasswordBtn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!currentPassword || !newPassword) {
    showToast('Please fill in all fields', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  const data = await apiCall('/admin/change-password', 'PUT', { currentPassword, newPassword });

  if (data && data.success) {
    showToast('Password changed successfully', 'success');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } else {
    showToast(data?.message || 'Failed to change password', 'error');
  }
});

// ─── Initial Load ───
loadStats();
