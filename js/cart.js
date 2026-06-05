/**
 * Cart state, persisted to localStorage. Stores only SKU + qty + the player
 * account info the order needs. Prices are always re-read from the catalog
 * (and re-validated on the server) so stale/tampered prices can't slip in.
 */
window.Cart = (function () {
  const KEY = 'tuz_cart_v1';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }
  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('cart:change', { detail: { count: count() } }));
  }

  function items() {
    // hydrate with live catalog data
    return read().map(it => {
      const found = window.CATALOG.findSku(it.sku);
      if (!found) return null;
      return {
        sku: it.sku,
        qty: it.qty,
        playerId: it.playerId || '',
        serverId: it.serverId || '',
        username: it.username || '',
        game: found.game,
        denom: found.denom,
        lineTotal: found.denom.price * it.qty,
      };
    }).filter(Boolean);
  }

  function add(sku, { playerId = '', serverId = '', username = '', qty = 1 } = {}) {
    const list = read();
    const existing = list.find(x => x.sku === sku && x.playerId === playerId && x.serverId === serverId);
    if (existing) { existing.qty += qty; existing.username = username || existing.username; }
    else list.push({ sku, qty, playerId, serverId, username });
    write(list);
  }

  function update(index, patch) {
    const list = read();
    if (!list[index]) return;
    list[index] = { ...list[index], ...patch };
    if (list[index].qty < 1) list[index].qty = 1;
    write(list);
  }

  function remove(index) {
    const list = read();
    list.splice(index, 1);
    write(list);
  }

  function clear() { write([]); }

  function count() { return read().reduce((n, x) => n + x.qty, 0); }

  function totals() {
    const subtotal = items().reduce((s, it) => s + it.lineTotal, 0);
    const fee = subtotal > 0 ? Math.round(subtotal * 0.02) : 0; // 2% processing (demo)
    return { subtotal, fee, total: subtotal + fee };
  }

  return { items, add, update, remove, clear, count, totals };
})();
