/* Cart page: list items, qty controls, remove, totals, go to checkout. */
(function () {
  const C = window.CATALOG;
  const root = document.getElementById('cartContent');

  function render() {
    const items = window.Cart.items();
    if (!items.length) {
      root.innerHTML = `
        <div class="empty-state">
          <div class="es-emoji">🛒</div>
          <h2>Your cart is empty</h2>
          <p>Browse games and add a top-up to get started.</p>
          <a class="btn btn-primary btn-lg" href="index.html#games">Browse games</a>
        </div>`;
      return;
    }

    const t = window.Cart.totals();
    root.innerHTML = `
      <div class="cart-grid">
        <div class="cart-items">
          ${items.map((it, i) => `
            <div class="cart-row">
              ${window.coverHTML(it.game.id, it.game.name, '')}
              <div class="cr-info">
                <h3>${it.game.name}</h3>
                <div class="cr-sub">${window.currencyIconHTML(it.game.id)}${it.denom.label}${it.denom.bonus ? ' • ' + it.denom.bonus : ''}</div>
                <div class="cr-acct">${it.game.idLabel || 'ID'}: ${it.playerId || '—'}${it.serverId ? ' • Server: ' + it.serverId : ''}${it.username ? ' • ' + it.username : ''}</div>
              </div>
              <div class="cr-right">
                <button class="cr-remove" data-remove="${i}" title="Remove item" aria-label="Remove">🗑 Remove</button>
                <div class="cr-price">${window.inr(it.lineTotal)}</div>
                <div class="qty">
                  <button data-dec="${i}" aria-label="Decrease">−</button>
                  <span>${it.qty}</span>
                  <button data-inc="${i}" aria-label="Increase">+</button>
                </div>
              </div>
            </div>`).join('')}
        </div>

        <aside class="summary-card">
          <h3>Order summary</h3>
          <div class="promo">
            <input type="text" id="promo" placeholder="Promo code" />
            <button class="btn btn-ghost btn-sm" id="applyPromo">Apply</button>
          </div>
          <div class="summary-line"><span>Subtotal</span><strong>${window.inr(t.subtotal)}</strong></div>
          <div class="summary-line"><span>Processing fee (2%)</span><strong>${window.inr(t.fee)}</strong></div>
          <div class="summary-line total"><span>Total</span><strong>${window.inr(t.total)}</strong></div>
          <a class="btn btn-primary btn-block btn-lg" href="checkout.html" style="margin-top:1rem">Proceed to checkout</a>
          <a class="btn btn-ghost btn-block" href="index.html#games" style="margin-top:.6rem">Continue shopping</a>
          <button class="btn-clear" id="clearCart" type="button">Clear cart</button>
          <div class="secure-note">🔒 Secured by Cashfree Payments</div>
        </aside>
      </div>`;
  }

  render();

  root.addEventListener('click', e => {
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    const rem = e.target.closest('[data-remove]');
    const promo = e.target.closest('#applyPromo');
    const clear = e.target.closest('#clearCart');

    if (inc) { const i = +inc.dataset.inc; window.Cart.update(i, { qty: window.Cart.items()[i].qty + 1 }); render(); }
    else if (dec) { const i = +dec.dataset.dec; window.Cart.update(i, { qty: window.Cart.items()[i].qty - 1 }); render(); }
    else if (rem) { window.Cart.remove(+rem.dataset.remove); render(); window.toast('🗑 Item removed.'); }
    else if (clear) { window.Cart.clear(); render(); window.toast('Cart cleared.'); }
    else if (promo) { window.toast('Promo codes aren\'t active yet.'); }
  });

  // Search dropdown
  const search = document.getElementById('headerSearch');
  const results = document.getElementById('searchResults');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      if (!q) { results.classList.remove('open'); return; }
      const m = C.games.filter(g => g.name.toLowerCase().includes(q)).slice(0, 6);
      results.innerHTML = m.length
        ? m.map(g => `<a href="game.html?id=${g.id}">${window.coverHTML(g.id, '')}
            <div><div class="sr-name">${g.name}</div><div class="sr-pub">${g.publisher}</div></div></a>`).join('')
        : '<div style="padding:.8rem;color:var(--muted);font-size:.88rem">No games found.</div>';
      results.classList.add('open');
    });
    document.addEventListener('click', e => { if (!e.target.closest('.header-search')) results.classList.remove('open'); });
  }
})();
