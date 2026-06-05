/**
 * Site configuration store (admin-editable), persisted to data/config.json.
 * Holds:
 *   - priceOverrides: { sku: price }   → overrides default catalog prices
 *   - labelOverrides: { sku: label }   → overrides the quantity/label shown
 *   - hero: [ { id, image } ]          → homepage hero is now uploaded images
 *   - logos: { gameId: filename }      → record of uploaded logo files
 *
 * The server treats priceOverrides as authoritative at order time, so admin
 * price changes apply to real charges immediately.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

let cfg = { priceOverrides: {}, labelOverrides: {}, hero: [], logos: {}, socials: {}, currencyIcons: {} };
try {
  if (fs.existsSync(FILE)) {
    const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cfg = { priceOverrides: {}, labelOverrides: {}, hero: [], logos: {}, socials: {}, currencyIcons: {}, ...loaded };
    if (!Array.isArray(cfg.hero)) cfg.hero = [];
    // Drop any legacy text-based hero slides (keep only image slides).
    cfg.hero = cfg.hero.filter(h => h && h.image);
  } else {
    save();
  }
} catch (e) {
  console.error('config.json read failed, using defaults:', e.message);
}

function save() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('config write failed:', e.message); }
}

export function getConfig() { return cfg; }
export function publicConfig() {
  return { hero: cfg.hero, priceOverrides: cfg.priceOverrides, labelOverrides: cfg.labelOverrides,
    logos: cfg.logos, socials: cfg.socials, currencyIcons: cfg.currencyIcons };
}

/* Currency icons (keyed by game id) */
export function setCurrencyIcon(gameId, filename) { cfg.currencyIcons[gameId] = filename; save(); return cfg.currencyIcons; }
export function clearCurrencyIcon(gameId) { delete cfg.currencyIcons[gameId]; save(); return cfg.currencyIcons; }

/* Social media links */
export function setSocials(map) {
  const allowed = ['facebook', 'instagram', 'x', 'youtube', 'discord', 'telegram', 'whatsapp'];
  for (const [k, v] of Object.entries(map || {})) {
    if (!allowed.includes(k)) continue;
    const url = String(v || '').trim().slice(0, 300);
    if (url) cfg.socials[k] = url; else delete cfg.socials[k];
  }
  save();
  return cfg.socials;
}

/* Prices */
export function setPrice(sku, price) {
  const p = Math.round(Number(price));
  if (!sku || !Number.isFinite(p) || p < 0) throw new Error('Invalid price.');
  cfg.priceOverrides[sku] = p;
  save();
  return cfg.priceOverrides;
}
export function setPrices(map) {
  for (const [sku, price] of Object.entries(map || {})) {
    const p = Math.round(Number(price));
    if (sku && Number.isFinite(p) && p >= 0) cfg.priceOverrides[sku] = p;
  }
  save();
  return cfg.priceOverrides;
}
export function clearPrice(sku) { delete cfg.priceOverrides[sku]; save(); return cfg.priceOverrides; }
export function priceFor(sku, base) {
  return Object.prototype.hasOwnProperty.call(cfg.priceOverrides, sku) ? cfg.priceOverrides[sku] : base;
}

/* Labels (quantity offered) */
export function setLabel(sku, label) {
  const l = String(label || '').trim().slice(0, 60);
  if (!sku) throw new Error('Missing sku.');
  if (l) cfg.labelOverrides[sku] = l; else delete cfg.labelOverrides[sku];
  save();
  return cfg.labelOverrides;
}
export function clearLabel(sku) { delete cfg.labelOverrides[sku]; save(); return cfg.labelOverrides; }

/* Combined pack update (price + label) */
export function setPack(sku, { price, label }) {
  if (price !== undefined && price !== null && price !== '') setPrice(sku, price);
  if (label !== undefined) setLabel(sku, label);
  return { priceOverrides: cfg.priceOverrides, labelOverrides: cfg.labelOverrides };
}
export function clearPack(sku) {
  delete cfg.priceOverrides[sku];
  delete cfg.labelOverrides[sku];
  save();
  return { priceOverrides: cfg.priceOverrides, labelOverrides: cfg.labelOverrides };
}

/* Hero (image slides) */
export function getHero() { return cfg.hero; }
export function addHeroImage(filename) {
  const slide = { id: 'h_' + Date.now().toString(36), image: filename };
  cfg.hero.push(slide);
  save();
  return cfg.hero;
}
export function removeHero(id) {
  cfg.hero = cfg.hero.filter(h => h.id !== id);
  save();
  return cfg.hero;
}
export function getHeroSlide(id) { return cfg.hero.find(h => h.id === id) || null; }
export function reorderHero(ids) {
  const map = new Map(cfg.hero.map(h => [h.id, h]));
  const next = ids.map(id => map.get(id)).filter(Boolean);
  if (next.length === cfg.hero.length) { cfg.hero = next; save(); }
  return cfg.hero;
}

/* Logos */
export function setLogo(gameId, filename) { cfg.logos[gameId] = filename; save(); return cfg.logos; }
export function clearLogo(gameId) { delete cfg.logos[gameId]; save(); return cfg.logos; }
