/**
 * Tiny JSON-file data store (no external DB needed for now).
 * Persists users and orders to server/data/db.json.
 *
 * ⚠️ Passwords are stored ONLY as scrypt hashes (see auth.js). The plaintext
 * password is never written to disk or logged anywhere.
 *
 * For production scale, swap this for SQLite/Postgres — the function surface
 * (getUserByEmail, createUser, etc.) is kept small so it's easy to replace.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

let db = { users: [], orders: [] };
try {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch (e) {
  console.error('Could not read db.json, starting fresh:', e.message);
}

let writeTimer = null;
function persist() {
  // debounce writes a touch to avoid hammering disk
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, DB_FILE); // atomic-ish replace
    } catch (e) {
      console.error('db write failed:', e.message);
    }
  }, 50);
}

/* ---------- Users ---------- */
export function getUserByEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  return db.users.find(u => u.email === e) || null;
}

export function getUserById(id) {
  return db.users.find(u => u.id === id) || null;
}

export function createUser({ email, name, passHash }) {
  const user = {
    id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    email: String(email).toLowerCase().trim(),
    name: String(name || '').trim(),
    passHash,
    savedIds: [],
    createdAt: Date.now(),
  };
  db.users.push(user);
  persist();
  return user;
}

export function updateUser(id, patch) {
  const u = getUserById(id);
  if (!u) return null;
  Object.assign(u, patch);
  persist();
  return u;
}

/* ---------- Saved game IDs ---------- */
export function addSavedId(userId, entry) {
  const u = getUserById(userId);
  if (!u) return null;
  if (!Array.isArray(u.savedIds)) u.savedIds = [];
  // de-dupe on game + playerId + server
  const exists = u.savedIds.find(s =>
    s.game === entry.game && s.playerId === entry.playerId && (s.serverId || '') === (entry.serverId || ''));
  if (!exists) {
    u.savedIds.unshift({ ...entry, savedAt: Date.now() });
    u.savedIds = u.savedIds.slice(0, 30);
    persist();
  }
  return u.savedIds;
}

export function removeSavedId(userId, index) {
  const u = getUserById(userId);
  if (!u || !Array.isArray(u.savedIds)) return null;
  u.savedIds.splice(index, 1);
  persist();
  return u.savedIds;
}

/* ---------- Orders ---------- */
export function saveOrder(order) {
  db.orders.push(order);
  persist();
  return order;
}

export function getOrder(orderId) {
  return db.orders.find(o => o.orderId === orderId) || null;
}

export function updateOrder(orderId, patch) {
  const o = getOrder(orderId);
  if (!o) return null;
  Object.assign(o, patch);
  persist();
  return o;
}

export function getOrdersByUser(userId) {
  return db.orders
    .filter(o => o.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Public-safe view of a user (no hash). */
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, savedIds: u.savedIds || [], createdAt: u.createdAt };
}
