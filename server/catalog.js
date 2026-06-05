/**
 * Server-side price book — the ONLY source of truth for amounts.
 * The browser sends SKUs; the server looks up the price here so a tampered
 * client can never change what gets charged. Keep in sync with /js/catalog.js.
 */
export const PRICES = {
  // Free Fire (Garena)
  'free-fire-100': 80, 'free-fire-310': 240, 'free-fire-520': 400,
  'free-fire-1060': 799, 'free-fire-2180': 1600, 'free-fire-5600': 3999,
  // BGMI (Krafton)
  'bgmi-60': 75, 'bgmi-325': 419, 'bgmi-660': 799,
  'bgmi-1800': 1950, 'bgmi-3850': 3999, 'bgmi-8100': 7999,
  // PUBG Mobile
  'pubg-mobile-60': 75, 'pubg-mobile-325': 419, 'pubg-mobile-660': 799,
  'pubg-mobile-1800': 1950, 'pubg-mobile-3850': 3999, 'pubg-mobile-8100': 7999,
  // Mobile Legends (Moonton)
  'mobile-legends-86': 99, 'mobile-legends-172': 189, 'mobile-legends-257': 279,
  'mobile-legends-706': 749, 'mobile-legends-1412': 1499, 'mobile-legends-2195': 2299,
  // Genshin Impact (HoYoverse)
  'genshin-impact-60': 89, 'genshin-impact-330': 449, 'genshin-impact-1090': 1299,
  'genshin-impact-2240': 2599, 'genshin-impact-3880': 3999, 'genshin-impact-8080': 7499,
  // Call of Duty: Mobile
  'cod-mobile-80': 75, 'cod-mobile-400': 389, 'cod-mobile-800': 759,
  'cod-mobile-2000': 1799, 'cod-mobile-5000': 3999, 'cod-mobile-10800': 7999,
  // Valorant (Riot)
  'valorant-475': 399, 'valorant-1000': 799, 'valorant-2050': 1599,
  'valorant-3650': 2799, 'valorant-5350': 3999, 'valorant-11000': 7999,
  // Clash of Clans (Supercell)
  'clash-of-clans-80': 79, 'clash-of-clans-500': 399, 'clash-of-clans-1200': 899,
  'clash-of-clans-2500': 1799, 'clash-of-clans-6500': 3999, 'clash-of-clans-14000': 7999,
  // Clash Royale (Supercell)
  'clash-royale-80': 79, 'clash-royale-500': 399, 'clash-royale-1200': 899,
  'clash-royale-2500': 1799, 'clash-royale-6500': 3999, 'clash-royale-14000': 7999,
  // Honkai: Star Rail (HoYoverse)
  'honkai-star-rail-60': 89, 'honkai-star-rail-330': 449, 'honkai-star-rail-1090': 1299,
  'honkai-star-rail-2240': 2599, 'honkai-star-rail-3880': 3999, 'honkai-star-rail-8080': 7499,
  // LoL: Wild Rift (Riot)
  'wild-rift-225': 299, 'wild-rift-525': 699, 'wild-rift-1075': 1399,
  'wild-rift-2195': 2799, 'wild-rift-3750': 4599, 'wild-rift-7800': 8999,
  // Pokémon UNITE
  'pokemon-unite-60': 79, 'pokemon-unite-250': 319, 'pokemon-unite-490': 599,
  'pokemon-unite-1000': 1199, 'pokemon-unite-2525': 2999, 'pokemon-unite-5275': 5999,
};

export const FEE_RATE = 0.02; // 2% processing fee, matches the client display

/**
 * Maps our internal game ids to the RapidAPI game slug used in the verification
 * URL. ONLY games that the configured provider actually supports belong here.
 * Confirmed working on the id-game-checker provider. Games NOT listed here are
 * reported to the UI as "verification unavailable" (the user can still buy).
 *
 * When you switch to a provider that supports more games, add/adjust slugs here
 * (and update VERIFY_NEEDS_SERVER / the URL config in .env).
 */
export const VERIFY_SLUGS = {
  'free-fire': 'free-fire',
  'mobile-legends': 'mobile-legends',
  // Examples the same provider supports (not all are in our store catalog):
  // 'arena-of-valor': 'arena-of-valor', 'clash-royale': 'clash-royale',
  // 'speed-drifters': 'speed-drifters', 'metal-slug': 'metal-slug',
};

/** Games whose verification URL needs an extra server/zone segment. */
export const VERIFY_NEEDS_SERVER = { 'mobile-legends': true };

/** Recompute the authoritative total from SKUs the client sent.
 *  `priceFor(sku, basePrice)` lets the caller apply admin overrides. */
export function priceCart(items, priceFor) {
  const resolve = typeof priceFor === 'function' ? priceFor : (_sku, base) => base;
  let subtotal = 0;
  const lines = [];
  for (const it of items) {
    const base = PRICES[it.sku];
    if (base == null) throw new Error('Unknown SKU: ' + it.sku);
    const price = resolve(it.sku, base);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    subtotal += price * qty;
    lines.push({ sku: it.sku, qty, unit: price, lineTotal: price * qty,
      playerId: String(it.playerId || '').slice(0, 64),
      serverId: String(it.serverId || '').slice(0, 64),
      username: String(it.username || '').slice(0, 64) });
  }
  const fee = subtotal > 0 ? Math.round(subtotal * FEE_RATE) : 0;
  return { lines, subtotal, fee, total: subtotal + fee };
}
