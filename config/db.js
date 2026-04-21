const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'zenquota.db');

let db = null;
let SQL = null;

/**
 * Initialize the database (async)
 */
async function initDB() {
  if (db) return db;

  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      wallet_balance REAL DEFAULT 0,
      daily_quote_count INTEGER DEFAULT 0,
      bonus_quotes INTEGER DEFAULT 0,
      last_reset_date TEXT DEFAULT '',
      is_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      fingerprint_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      value INTEGER DEFAULT 10,
      status TEXT DEFAULT 'unused',
      created_at TEXT DEFAULT (datetime('now')),
      expiry_date TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recharge_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Seed default admin if not exists
  const adminCheck = db.exec("SELECT id FROM admins WHERE username = 'admin'");
  if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 12);
    db.run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
    console.log('✅ Default admin created: admin / admin123');
  }

  saveDB();
  console.log('✅ Database initialized');
  return db;
}

/**
 * Save database to disk
 */
function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * Wrapper for db.prepare().get() — returns one row as object
 */
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const result = [];

  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();

  return result.length > 0 ? result[0] : null;
}

/**
 * Wrapper for db.prepare().all() — returns array of objects
 */
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const result = [];

  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();

  return result;
}

/**
 * Run a statement (INSERT/UPDATE/DELETE)
 */
function runSQL(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return {
    lastInsertRowid: getOne('SELECT last_insert_rowid() as id')?.id || 0,
    changes: db.getRowsModified()
  };
}

module.exports = {
  initDB,
  saveDB,
  getOne,
  getAll,
  runSQL,
  getDB: () => db
};
