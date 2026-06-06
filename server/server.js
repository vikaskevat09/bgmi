/**
 * TopUpWorld backend
 * -----------------
 * - Serves the static site (the project root)
 * - POST /api/create-order  → creates a Cashfree order, returns payment_session_id
 * - POST /api/webhook        → receives + verifies Cashfree payment webhooks
 * - GET  /api/order/:id      → polls order status (used by return.html)
 *
 * Cashfree integration uses the v3 "Create Order" REST API. The order amount is
 * recomputed here from the price book so the client can never set its own price.
 */
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import fs from 'fs';
import { priceCart, VERIFY_SLUGS, VERIFY_NEEDS_SERVER } from './catalog.js';
import * as store from './store.js';
import * as admin from './adminconfig.js';
import { cloudEnabled, uploadImage, destroyImage } from './cloud.js';
import {
  hashPassword, verifyPassword, createSessionToken, verifySessionToken,
  setSessionCookie, clearSessionCookie, parseCookies, SESSION_COOKIE, sessionCookieAttrs,
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const {
  CASHFREE_ENV = 'sandbox',
  CASHFREE_APP_ID = '',
  CASHFREE_SECRET_KEY = '',
  CASHFREE_API_VERSION = '2023-08-01',
  RETURN_URL = 'http://localhost:8080/return.html',
  NOTIFY_URL = 'http://localhost:8080/api/webhook',
  PORT = 8080,
  CORS_ORIGIN = '*',
  ADMIN_PASSWORD = '',
  RAPIDAPI_KEY = '',
  RAPIDAPI_HOST = '',
  RAPIDAPI_URL_TEMPLATE = '',
  RAPIDAPI_DEFAULT_REGION = '',
} = process.env;

const CF_BASE = CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const app = express();
// CORS — allow the configured frontend origin(s) with credentials (cookies).
// CORS_ORIGIN can be "*" (dev) or a comma-separated list of allowed origins
// e.g. "https://topupworld.com,https://www.topupworld.com"
const ALLOWED = CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, cb) {
    // allow same-origin / curl (no origin), and "*" dev mode
    if (!origin || ALLOWED.includes('*')) return cb(null, true);
    return cb(null, ALLOWED.includes(origin) ? origin : false);
  },
  credentials: true,
}));

// Capture the raw body for webhook signature verification.
app.use(express.json({
  limit: '8mb', // allow base64 logo uploads
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Resolve the logged-in user (if any) from the session cookie.
app.use((req, _res, next) => {
  try {
    const token = parseCookies(req)[SESSION_COOKIE];
    const userId = token ? verifySessionToken(token) : null;
    req.user = userId ? store.getUserById(userId) : null;
  } catch { req.user = null; }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Please sign in.' });
  next();
}

/* ---- Admin auth (separate cookie, password from .env) ---- */
const ADMIN_COOKIE = 'tuz_admin';
function requireAdmin(req, res, next) {
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (token && verifySessionToken(token) === 'ADMIN') return next();
  return res.status(401).json({ message: 'Admin authentication required.' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.status(500).json({ message: 'Admin password not configured on server.' });
  if (String(password) !== String(ADMIN_PASSWORD)) {
    return res.status(401).json({ message: 'Incorrect admin password.' });
  }
  const token = createSessionToken('ADMIN');
  res.setHeader('Set-Cookie',
    `${ADMIN_COOKIE}=${token}; HttpOnly; ${sessionCookieAttrs()}; Path=/; Max-Age=${60 * 60 * 12}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; ${sessionCookieAttrs()}; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/admin/check', (req, res) => {
  const token = parseCookies(req)[ADMIN_COOKIE];
  res.json({ admin: !!(token && verifySessionToken(token) === 'ADMIN') });
});

/* ---- Public site config (hero, price overrides, logos) ---- */
app.get('/api/config', (_req, res) => {
  res.json(admin.publicConfig());
});

/* ---- Admin: prices + labels (quantity offered) ---- */
app.get('/api/admin/prices', requireAdmin, (_req, res) => {
  res.json({ overrides: admin.getConfig().priceOverrides, labels: admin.getConfig().labelOverrides });
});
app.post('/api/admin/prices', requireAdmin, (req, res) => {
  try { res.json({ overrides: admin.setPrices(req.body.prices || {}) }); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
/* Update a single pack's price and/or label (quantity). */
app.post('/api/admin/pack/:sku', requireAdmin, (req, res) => {
  try {
    const out = admin.setPack(req.params.sku, { price: req.body.price, label: req.body.label });
    res.json(out);
  } catch (e) { res.status(400).json({ message: e.message }); }
});
app.delete('/api/admin/pack/:sku', requireAdmin, (req, res) => {
  res.json(admin.clearPack(req.params.sku));
});
app.delete('/api/admin/prices/:sku', requireAdmin, (req, res) => {
  res.json({ overrides: admin.clearPrice(req.params.sku) });
});

/* ---- Admin: hero (uploaded images) ---- */
app.get('/api/admin/hero', requireAdmin, (_req, res) => res.json({ hero: admin.getHero() }));

/* Upload a hero image (base64) → Cloudinary if configured, else local. */
app.post('/api/admin/hero', requireAdmin, async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
    if (!m) return res.status(400).json({ message: 'Provide a PNG/JPG/WEBP image.' });
    let ext = m[1].toLowerCase(); if (ext === 'jpeg') ext = 'jpg';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ message: 'Image too large (max 6MB).' });

    const id = 'h_' + Date.now().toString(36);
    let image;
    if (cloudEnabled()) {
      image = await uploadImage(dataUrl, `topupworld/hero/${id}`);
    } else {
      const dir = path.join(ROOT, 'assets', 'hero');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${id}.${ext}`), buf);
      image = `assets/hero/${id}.${ext}`;
    }
    const slide = { id, image };
    admin.getConfig().hero.push(slide);
    admin.reorderHero(admin.getConfig().hero.map(h => h.id)); // triggers save
    res.json({ hero: admin.getHero(), added: slide });
  } catch (e) {
    console.error('hero upload error:', e);
    res.status(500).json({ message: e.message || 'Upload failed.' });
  }
});

app.delete('/api/admin/hero/:id', requireAdmin, async (req, res) => {
  const slide = admin.getHeroSlide(req.params.id);
  if (slide && slide.image) {
    if (/^https?:\/\//i.test(slide.image)) { await destroyImage(`topupworld/hero/${slide.id}`); }
    else { const p = path.join(ROOT, slide.image); if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} } }
  }
  res.json({ hero: admin.removeHero(req.params.id) });
});
app.post('/api/admin/hero/reorder', requireAdmin, (req, res) => {
  res.json({ hero: admin.reorderHero(req.body.ids || []) });
});

/* ---- Admin: social media links ---- */
app.get('/api/admin/socials', requireAdmin, (_req, res) => res.json({ socials: admin.getConfig().socials || {} }));
app.post('/api/admin/socials', requireAdmin, (req, res) => {
  res.json({ socials: admin.setSocials(req.body.socials || {}) });
});

/* ---- Admin: logo upload / remove ----
 * Cloudinary (if configured) keeps it permanent; else local file (dev). */
app.post('/api/admin/logo/:gameId', requireAdmin, async (req, res) => {
  try {
    const gameId = String(req.params.gameId).replace(/[^a-z0-9-]/gi, '');
    const { dataUrl } = req.body || {};
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
    if (!gameId || !m) return res.status(400).json({ message: 'Provide a PNG/JPG/WEBP image.' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ message: 'Image too large (max 5MB).' });

    if (cloudEnabled()) {
      const url = await uploadImage(dataUrl, `topupworld/games/${gameId}`);
      admin.setLogo(gameId, url);
      return res.json({ ok: true, file: url });
    }
    let ext = m[1].toLowerCase(); if (ext === 'jpeg') ext = 'jpg';
    const dir = path.join(ROOT, 'assets', 'games');
    fs.mkdirSync(dir, { recursive: true });
    for (const e of ['png', 'jpg', 'webp']) {
      const p = path.join(dir, `${gameId}.${e}`);
      if (e !== ext && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
    }
    fs.writeFileSync(path.join(dir, `${gameId}.${ext}`), buf);
    admin.setLogo(gameId, `${gameId}.${ext}`);
    res.json({ ok: true, file: `${gameId}.${ext}` });
  } catch (e) {
    console.error('logo upload error:', e);
    res.status(500).json({ message: e.message || 'Upload failed.' });
  }
});

app.delete('/api/admin/logo/:gameId', requireAdmin, async (req, res) => {
  const gameId = String(req.params.gameId).replace(/[^a-z0-9-]/gi, '');
  if (cloudEnabled()) { await destroyImage(`topupworld/games/${gameId}`); }
  const dir = path.join(ROOT, 'assets', 'games');
  for (const e of ['png', 'jpg', 'webp']) {
    const p = path.join(dir, `${gameId}.${e}`);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
  }
  admin.clearLogo(gameId);
  res.json({ ok: true });
});

/* ---- Admin: site (brand) logo upload / remove ---- */
app.post('/api/admin/site-logo', requireAdmin, async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = /^data:image\/(png|webp|jpe?g|svg\+xml);base64,(.+)$/i.exec(dataUrl || '');
    if (!m) return res.status(400).json({ message: 'Provide a PNG/WEBP/SVG image.' });
    let ext = m[1].toLowerCase(); if (ext === 'jpeg') ext = 'jpg'; if (ext === 'svg+xml') ext = 'svg';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ message: 'Logo too large (max 2MB).' });

    if (cloudEnabled()) {
      const url = await uploadImage(dataUrl, 'topupworld/brand/logo');
      admin.setSiteLogo(url);
      return res.json({ ok: true, file: url });
    }
    const dir = path.join(ROOT, 'assets', 'brand');
    fs.mkdirSync(dir, { recursive: true });
    for (const e of ['png', 'jpg', 'webp', 'svg']) {
      const p = path.join(dir, `logo.${e}`);
      if (e !== ext && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
    }
    const filename = `assets/brand/logo.${ext}?v=${Date.now()}`;
    fs.writeFileSync(path.join(dir, `logo.${ext}`), buf);
    admin.setSiteLogo(filename);
    res.json({ ok: true, file: filename });
  } catch (e) {
    console.error('site-logo upload error:', e);
    res.status(500).json({ message: e.message || 'Upload failed.' });
  }
});

app.delete('/api/admin/site-logo', requireAdmin, async (req, res) => {
  if (cloudEnabled()) { await destroyImage('topupworld/brand/logo'); }
  const dir = path.join(ROOT, 'assets', 'brand');
  for (const e of ['png', 'jpg', 'webp', 'svg']) {
    const p = path.join(dir, `logo.${e}`);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
  }
  admin.clearSiteLogo();
  res.json({ ok: true });
});

/* ---- In-memory order store (swap for a real DB in production) ---- */
const ORDERS = new Map();

/* ============================================================
   AUTH ROUTES — email + password (scrypt hashed), session cookie
   ============================================================ */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* Sign up */
app.post('/api/auth/signup', (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Please enter your name.' });
    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ message: 'Enter a valid email.' });
    if (!password || String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }
    if (store.getUserByEmail(email)) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passHash = hashPassword(password); // plaintext never stored
    const user = store.createUser({ email, name, passHash });

    const token = createSessionToken(user.id);
    setSessionCookie(res, token);
    return res.json({ user: store.publicUser(user) });
  } catch (e) {
    console.error('signup error:', e);
    return res.status(500).json({ message: 'Could not create account.' });
  }
});

/* Log in */
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = store.getUserByEmail(email);
    // Same generic message whether email or password is wrong (avoids leaking which).
    if (!user || !verifyPassword(password || '', user.passHash)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const token = createSessionToken(user.id);
    setSessionCookie(res, token);
    return res.json({ user: store.publicUser(user) });
  } catch (e) {
    console.error('login error:', e);
    return res.status(500).json({ message: 'Could not sign in.' });
  }
});

/* Log out */
app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* Who am I */
app.get('/api/auth/me', (req, res) => {
  res.json({ user: store.publicUser(req.user) });
});

/* ---- Saved game IDs ---- */
app.get('/api/saved-ids', requireAuth, (req, res) => {
  res.json({ savedIds: req.user.savedIds || [] });
});

app.post('/api/saved-ids', requireAuth, (req, res) => {
  const { game, playerId, serverId, username } = req.body || {};
  if (!game || !playerId) return res.status(400).json({ message: 'Missing game or ID.' });
  const savedIds = store.addSavedId(req.user.id, {
    game: String(game).slice(0, 40),
    playerId: String(playerId).slice(0, 64),
    serverId: String(serverId || '').slice(0, 64),
    username: String(username || '').slice(0, 64),
  });
  res.json({ savedIds });
});

app.delete('/api/saved-ids/:index', requireAuth, (req, res) => {
  const savedIds = store.removeSavedId(req.user.id, parseInt(req.params.index, 10));
  res.json({ savedIds });
});

/* ---- Order history ---- */
app.get('/api/my-orders', requireAuth, (req, res) => {
  const orders = store.getOrdersByUser(req.user.id).map(o => ({
    orderId: o.orderId, status: o.status, amount: o.amount,
    items: o.lines, createdAt: o.createdAt,
  }));
  res.json({ orders });
});


/* ---- Coupon / price preview (lets the checkout show an accurate total) ---- */
app.post('/api/price-cart', (req, res) => {
  try {
    const { items, coupon } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }
    const priced = priceCart(items, admin.priceFor, coupon);
    res.json({
      subtotal: priced.subtotal,
      discount: priced.discount,
      coupon: priced.coupon,
      couponValid: priced.couponValid,
      couponMessage: priced.couponMessage,
      fee: priced.fee,
      total: priced.total,
    });
  } catch (e) {
    res.status(400).json({ message: e.message || 'Could not price cart.' });
  }
});

/* ---- Create order ---- */
app.post('/api/create-order', async (req, res) => {
  try {
    const { items, customer, coupon } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }
    if (!customer || !customer.name || !customer.phone || !customer.email) {
      return res.status(400).json({ message: 'Missing customer details.' });
    }

    // Authoritative pricing — ignores any amount the client might send.
    const priced = priceCart(items, admin.priceFor, coupon);
    if (priced.total <= 0) return res.status(400).json({ message: 'Invalid order total.' });

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      return res.status(500).json({
        message: 'Server is missing Cashfree credentials. Copy .env.example to .env and fill in your keys.',
      });
    }

    const orderId = 'TUZ_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const customerId = 'cust_' + crypto.createHash('sha1').update(customer.email).digest('hex').slice(0, 12);

    // Cashfree production requires HTTPS callback URLs. On localhost (http) we
    // omit them so testing still works; Cashfree shows its own result page.
    const order_meta = {};
    if (/^https:\/\//i.test(RETURN_URL)) order_meta.return_url = `${RETURN_URL}?order_id={order_id}`;
    if (/^https:\/\//i.test(NOTIFY_URL)) order_meta.notify_url = NOTIFY_URL;

    const body = {
      order_id: orderId,
      order_amount: Number(priced.total.toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: customerId,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
      },
      order_meta,
      order_note: 'TopUpWorld game top-up',
    };

    const cfRes = await fetch(`${CF_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': CASHFREE_API_VERSION,
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await cfRes.json();
    if (!cfRes.ok) {
      console.error('Cashfree create-order error:', data);
      return res.status(502).json({ message: data.message || 'Cashfree rejected the order.' });
    }

    // Persist what we need for fulfillment after payment confirms.
    const orderRecord = {
      orderId,
      userId: req.user ? req.user.id : null,
      status: 'CREATED',
      amount: priced.total,
      discount: priced.discount,
      coupon: priced.coupon,
      lines: priced.lines,
      customer,
      createdAt: Date.now(),
    };
    ORDERS.set(orderId, orderRecord);
    store.saveOrder(orderRecord); // also persist to disk (with userId for history)

    return res.json({
      order_id: orderId,
      payment_session_id: data.payment_session_id,
      mode: CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
      amount: priced.total,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || 'Internal error.' });
  }
});

/* ---- Webhook: Cashfree posts payment status here ---- */
app.post('/api/webhook', (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    // Cashfree signs: base64( HMAC-SHA256( timestamp + rawBody, secretKey ) )
    const expected = crypto
      .createHmac('sha256', CASHFREE_SECRET_KEY)
      .update((timestamp || '') + raw)
      .digest('base64');

    if (!signature || signature !== expected) {
      console.warn('Webhook signature mismatch — ignoring.');
      return res.status(401).send('invalid signature');
    }

    const event = req.body;
    const orderId = event?.data?.order?.order_id;
    const paymentStatus = event?.data?.payment?.payment_status;

    if (orderId && ORDERS.has(orderId)) {
      const order = ORDERS.get(orderId);
      order.status = paymentStatus || order.status;
      order.updatedAt = Date.now();
      ORDERS.set(orderId, order);
      store.updateOrder(orderId, { status: order.status, updatedAt: order.updatedAt });

      if (paymentStatus === 'SUCCESS') {
        fulfill(order); // deliver the top-up
      }
    }
    return res.status(200).send('ok');
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(500).send('error');
  }
});

/* ---- Order status (return page polls this) ---- */
app.get('/api/order/:id', (req, res) => {
  const order = ORDERS.get(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  res.json({ order_id: order.orderId, status: order.status, amount: order.amount });
});

/**
 * Fulfillment stub. This is where you'd call the game publisher's reseller API
 * (or your stock/voucher system) to actually deliver the currency, then notify
 * the customer. Kept idempotent: only fulfill once.
 */
function fulfill(order) {
  if (order.fulfilled) return;
  order.fulfilled = true;
  store.updateOrder(order.orderId, { fulfilled: true, status: 'SUCCESS' });
  console.log(`✅ Fulfilling order ${order.orderId}:`,
    order.lines.map(l => `${l.qty}× ${l.sku} → ID ${l.playerId}`).join(', '));
  // TODO: integrate reseller/delivery API + send confirmation email.
}

/* ---- ID verification (proxied to RapidAPI; key stays server-side) ----
 * GET /api/verify-id?game=ff&id=1234567890[&region=free-fire]
 * Returns a normalized shape: { ok, username, id, raw? }
 *
 * Expected upstream response (per your provider):
 *   { "error": false, "status": 200, "msg": "id_found",
 *     "data": { "id": "...", "username": "SoyBlaze" } }
 */
app.get('/api/verify-id', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    const game = String(req.query.game || '').trim();
    if (!id) return res.status(400).json({ ok: false, message: 'Missing id.' });
    if (id.length < 2 || id.length > 40) {
      return res.status(400).json({ ok: false, message: 'Player ID looks invalid.' });
    }

    // If we have no upstream config, do format-only validation so the UI still works.
    if (!RAPIDAPI_KEY || !RAPIDAPI_HOST) {
      return res.json({ ok: true, verified: false, username: null, id,
        message: 'Format looks valid (live verification not configured).' });
    }

    const region = String(req.query.region || '').trim()
      || VERIFY_SLUGS[game]
      || RAPIDAPI_DEFAULT_REGION;

    const server = String(req.query.server || '').trim();

    // Build the upstream URL. Supports both single-segment providers
    // (/{slug}/{id}) and games that need a server segment (/{slug}/{id}/{server}),
    // e.g. Mobile Legends. If a custom URL template is set, honor its
    // {region}/{id}/{server} placeholders; otherwise build from host + slug.
    let url;
    if (RAPIDAPI_URL_TEMPLATE && RAPIDAPI_URL_TEMPLATE.includes('{id}')) {
      url = RAPIDAPI_URL_TEMPLATE
        .replace('{region}', encodeURIComponent(region))
        .replace('{server}', encodeURIComponent(server))
        .replace('{id}', encodeURIComponent(id));
      // strip a trailing empty server segment if the template had one
      url = url.replace(/\/+$/, '');
    } else {
      const segs = [encodeURIComponent(region), encodeURIComponent(id)];
      if (server) segs.push(encodeURIComponent(server));
      url = `https://${RAPIDAPI_HOST}/${segs.join('/')}`;
    }

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    });

    const data = await upstream.json().catch(() => ({}));

    const norm = normalizeVerify(data, id);
    if (norm.verified) {
      return res.json({ ok: true, verified: true, username: norm.username, id: norm.id, banned: norm.banned, region: norm.region });
    }
    return res.json({
      ok: false, verified: false, username: null, id,
      message: norm.message || 'Could not verify this ID.',
    });
  } catch (e) {
    console.error('verify-id error:', e);
    return res.status(502).json({ ok: false, message: 'Verification service unavailable.' });
  }
});

/**
 * Normalizes different providers' responses into one shape.
 * Supports:
 *  A) id-game-checker: { error:false, msg:"id_found", data:{ id, username } }
 *  B) free-fire-info style: { success:true, data:{ id_ff, username, region, server, is_ban } }
 */
function normalizeVerify(data, fallbackId) {
  if (!data || typeof data !== 'object') return { verified: false, message: 'Empty response.' };

  // Shape B — { success, data: { id_ff, username, region, is_ban } }
  if (data.success === true && data.data && (data.data.id_ff !== undefined || data.data.username !== undefined)) {
    const d = data.data;
    const uname = (d.username || '').toString().trim();
    const banned = String(d.is_ban) === '1' || d.is_ban === true;
    // Some providers return the record (id present) even when username is blank.
    const exists = !!(d.id_ff || uname);
    if (!exists) return { verified: false, message: 'No account found for that ID.' };
    return {
      verified: true,
      username: uname || ('Player ' + (d.id_ff || fallbackId)),
      id: d.id_ff || fallbackId,
      region: (d.region || '').toString().trim(),
      banned,
    };
  }

  // Shape A — { error:false, msg:"id_found", data:{ id, username } }
  if (data.error === false && data.data && data.data.username) {
    return { verified: true, username: data.data.username, id: data.data.id || fallbackId };
  }

  // Known "not found" messages
  const msg = data.msg || data.message || '';
  if (/not[_ ]?found/i.test(msg)) return { verified: false, message: 'No account found for that ID.' };

  return { verified: false, message: msg || 'Could not verify this ID.' };
}

/* ---- Static site ---- */
app.use(express.static(ROOT, {
  setHeaders: (res, filePath) => {
    // Cache images/fonts aggressively; keep HTML fresh.
    if (/\.(png|jpe?g|webp|svg|gif|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
    } else if (/\.html?$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.listen(PORT, () => {
  console.log(`TopUpWorld server running at http://localhost:${PORT}`);
  console.log(`Cashfree mode: ${CASHFREE_ENV} (${CF_BASE})`);
  if (!CASHFREE_APP_ID) console.log('⚠️  No Cashfree keys yet — copy server/.env.example to server/.env and add them.');
});
