/**
 * Authentication helpers — password hashing + signed session tokens.
 *
 * Passwords: hashed with scrypt (Node built-in). We store "salt:hash" only.
 * The plaintext password is never stored, logged, or recoverable. Verification
 * uses a constant-time comparison to resist timing attacks.
 *
 * Sessions: a stateless signed token (userId.expiry.HMAC-SHA256) set as an
 * httpOnly cookie so client-side JS can't read it. Signed with SESSION_SECRET.
 */
import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET
  || 'dev-only-insecure-secret-change-me'; // set SESSION_SECRET in .env for prod
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE = 'tuz_session';

/* ---------- Password hashing (scrypt) ---------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashBuf = Buffer.from(hash, 'hex');
  const test = crypto.scryptSync(String(password), salt, 64);
  return hashBuf.length === test.length && crypto.timingSafeEqual(hashBuf, test);
}

/* ---------- Signed session tokens ---------- */
function sign(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

export function createSessionToken(userId) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const payload = `${userId}.${exp}`;
  const expected = sign(payload);
  // constant-time compare
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(exp)) return null;
  return userId;
}

/* ---------- Cookie helpers ---------- */
// For a split deploy (frontend on Hostinger, backend on Render), the session
// cookie is cross-site, so it must be SameSite=None; Secure. Controlled by env:
//   COOKIE_CROSS_SITE=true  → adds "SameSite=None; Secure"
// Locally (same origin, http) leave it unset → "SameSite=Lax".
const CROSS_SITE = String(process.env.COOKIE_CROSS_SITE || '').toLowerCase() === 'true';
const COOKIE_ATTRS = CROSS_SITE ? 'SameSite=None; Secure' : 'SameSite=Lax';

export function sessionCookieAttrs() { return COOKIE_ATTRS; }

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; ${COOKIE_ATTRS}; Path=/; Max-Age=${maxAge}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; ${COOKIE_ATTRS}; Path=/; Max-Age=0`);
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
