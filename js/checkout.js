/* Checkout page: customer details + Cashfree payment.
 *
 * Flow (production-correct for Cashfree):
 *   1. Browser POSTs the cart + customer info to our backend  /api/create-order
 *   2. Backend recomputes the amount from the catalog (never trusts the client),
 *      calls Cashfree "Create Order", and returns { payment_session_id, order_id }
 *   3. Browser hands payment_session_id to the Cashfree JS SDK to open checkout
 *   4. After payment, Cashfree redirects to /return?order_id=... and a webhook
 *      hits the backend to confirm + trigger fulfillment.
 */
(function () {
  const C = window.CATALOG;
  const root = document.getElementById('checkoutContent');

  // Point this at your backend. Defaults to same origin.
  const API_BASE = window.TUZ_API_BASE || '';

  const items = window.Cart.items();
  if (!items.length) {
    root.innerHTML = `<div class="empty-state"><div class="es-emoji">🛒</div>
      <h2>Nothing to check out</h2><p>Your cart is empty.</p>
      <a class="btn btn-primary btn-lg" href="index.html#games">Browse games</a></div>`;
    return;
  }

  const t = window.Cart.totals();

  root.innerHTML = `
    <div class="checkout-grid">
      <div>
        <div class="panel co-section">
          <div class="panel-title"><span class="step-badge">1</span> Contact details</div>
          <div class="co-fields">
            <div class="field"><label for="cName">Full name</label><input id="cName" type="text" placeholder="Your name" /></div>
            <div class="field"><label for="cPhone">Phone</label><input id="cPhone" type="tel" placeholder="10-digit mobile" inputmode="numeric" /></div>
            <div class="field full"><label for="cEmail">Email</label><input id="cEmail" type="email" placeholder="you@example.com" /></div>
          </div>
          <p class="field-hint">We'll send your order confirmation here.</p>
        </div>

        <div class="panel co-section">
          <div class="panel-title"><span class="step-badge">2</span> Delivery</div>
          <div class="deliver-rows">
            ${items.map(it => `
              <div class="deliver-row">
                ${window.coverHTML(it.game.id, '')}
                <div>
                  <div class="mi-name">${it.game.name}</div>
                  <div class="mi-sub">${window.currencyIconHTML(it.game.id)}${it.denom.label} × ${it.qty}</div>
                </div>
                <div class="deliver-id">
                  <span>${it.game.idLabel || 'ID'}</span>
                  <strong>${it.playerId || '—'}${it.serverId ? ' (' + it.serverId + ')' : ''}</strong>
                  ${it.username ? `<em>${it.username}</em>` : ''}
                </div>
              </div>`).join('')}
          </div>
          <p class="field-hint">⚡ Currency is delivered to these IDs instantly after payment.</p>
        </div>
      </div>

      <aside class="summary-card">
        <h3>Order summary</h3>
        <div class="mini-items">
          ${items.map(it => `
            <div class="mini-item">
              ${window.coverHTML(it.game.id, '')}
              <div>
                <div class="mi-name">${it.game.name}</div>
                <div class="mi-sub">${window.currencyIconHTML(it.game.id)}${it.denom.label} × ${it.qty} • ID ${it.playerId || '—'}${it.username ? ' (' + it.username + ')' : ''}</div>
              </div>
              <div class="mi-price">${window.inr(it.lineTotal)}</div>
            </div>`).join('')}
        </div>
        <div class="coupon-box">
          <div class="coupon-row">
            <input id="couponInput" type="text" placeholder="Coupon code (e.g. NEWUSER)" autocomplete="off" />
            <button class="btn btn-dark btn-sm" id="couponBtn" type="button">Apply</button>
          </div>
          <p class="coupon-msg" id="couponMsg">🎉 Use <strong>NEWUSER</strong> for 50% off Free Fire &amp; BGMI Mega packs.</p>
        </div>
        <div class="summary-line"><span>Subtotal</span><strong id="sumSubtotal">${window.inr(t.subtotal)}</strong></div>
        <div class="summary-line" id="sumDiscountRow" style="display:none"><span>Discount</span><strong id="sumDiscount" style="color:#34c759">-₹0</strong></div>
        <div class="summary-line"><span>Processing fee (2%)</span><strong id="sumFee">${window.inr(t.fee)}</strong></div>
        <div class="summary-line total"><span>Total payable</span><strong id="sumTotal">${window.inr(t.total)}</strong></div>
        <button class="btn btn-primary btn-block btn-lg" id="payBtn" style="margin-top:1rem">🔒 Pay ${window.inr(t.total)}</button>
        <a class="btn btn-ghost btn-block" href="cart.html" style="margin-top:.6rem">Back to cart</a>
        <div class="pay-badges">
          <span>UPI</span><span>VISA</span><span>Mastercard</span><span>RuPay</span><span>NetBanking</span><span>Wallets</span>
        </div>
        <div class="secure-note">🔒 Secured by Cashfree Payments — all methods available at checkout</div>
      </aside>
    </div>`;

  // ----- Coupon handling (server is authoritative) -----
  let appliedCoupon = null;
  let totals = { subtotal: t.subtotal, fee: t.fee, total: t.total, discount: 0 };

  function paymentItems() {
    return window.Cart.items().map(it => ({
      sku: it.sku, qty: it.qty, playerId: it.playerId, serverId: it.serverId, username: it.username,
    }));
  }

  function renderTotals() {
    document.getElementById('sumSubtotal').textContent = window.inr(totals.subtotal);
    document.getElementById('sumFee').textContent = window.inr(totals.fee);
    document.getElementById('sumTotal').textContent = window.inr(totals.total);
    const dRow = document.getElementById('sumDiscountRow');
    if (totals.discount > 0) {
      dRow.style.display = '';
      document.getElementById('sumDiscount').textContent = '-' + window.inr(totals.discount);
    } else {
      dRow.style.display = 'none';
    }
    const btn = document.getElementById('payBtn');
    if (!btn.disabled) btn.textContent = '🔒 Pay ' + window.inr(totals.total);
  }

  async function applyCoupon() {
    const input = document.getElementById('couponInput');
    const msg = document.getElementById('couponMsg');
    const code = input.value.trim();
    if (!code) { window.toast('⚠️ Enter a coupon code.', 'err'); return; }
    try {
      const res = await fetch(API_BASE + '/api/price-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: paymentItems(), coupon: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not apply coupon.');
      if (data.couponValid && data.discount > 0) {
        appliedCoupon = data.coupon;
        totals = { subtotal: data.subtotal, fee: data.fee, total: data.total, discount: data.discount };
        msg.innerHTML = `✅ <strong>${data.coupon}</strong> applied — you saved ${window.inr(data.discount)}! (${data.couponMessage})`;
        msg.classList.add('ok');
        renderTotals();
        window.toast('✅ Coupon applied — saved ' + window.inr(data.discount), 'ok');
      } else {
        appliedCoupon = null;
        totals = { subtotal: data.subtotal, fee: data.fee, total: data.total, discount: 0 };
        msg.textContent = '⚠️ ' + (data.couponMessage || 'This coupon is not valid for your cart.');
        msg.classList.remove('ok');
        renderTotals();
      }
    } catch (e) {
      window.toast('⚠️ ' + e.message, 'err');
    }
  }
  document.getElementById('couponBtn').addEventListener('click', applyCoupon);
  document.getElementById('couponInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });

  function validate() {
    const name = document.getElementById('cName').value.trim();
    const phone = document.getElementById('cPhone').value.trim();
    const email = document.getElementById('cEmail').value.trim();
    if (!name) return err('Please enter your name.');
    if (!/^\d{10}$/.test(phone)) return err('Enter a valid 10-digit phone number.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter a valid email address.');
    return { name, phone, email };
  }
  function err(m) { window.toast('⚠️ ' + m, 'err'); return null; }

  // Prefill contact details for logged-in users.
  (async function prefill() {
    const user = window.Auth ? await window.Auth.me() : null;
    if (user) {
      const n = document.getElementById('cName'); if (n && !n.value) n.value = user.name || '';
      const e = document.getElementById('cEmail'); if (e && !e.value) e.value = user.email || '';
    }
  })();

  document.getElementById('payBtn').addEventListener('click', startPayment);

  async function startPayment() {
    const customer = validate();
    if (!customer) return;

    const btn = document.getElementById('payBtn');
    btn.disabled = true;
    btn.textContent = 'Opening secure checkout…';

    // Backend gets only SKUs + qty + account info; it recomputes price itself.
    const payload = {
      customer,
      coupon: appliedCoupon || undefined,
      items: window.Cart.items().map(it => ({
        sku: it.sku, qty: it.qty, playerId: it.playerId, serverId: it.serverId, username: it.username,
      })),
    };

    try {
      const res = await fetch(API_BASE + '/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Order creation failed (' + res.status + ')');
      if (!data.payment_session_id) throw new Error(data.message || 'No payment session returned');

      // Save the player IDs to the user's account (if signed in) for next time.
      if (window.Auth && window.Auth.user) {
        window.Cart.items().forEach(it => {
          window.Auth.saveId({ game: it.game.id, playerId: it.playerId, serverId: it.serverId, username: it.username });
        });
      }

      if (typeof Cashfree !== 'function' && typeof Cashfree !== 'object') {
        throw new Error('Cashfree SDK not loaded');
      }
      const cashfree = Cashfree({ mode: data.mode || 'production' });
      await cashfree.checkout({
        paymentSessionId: data.payment_session_id,
        redirectTarget: '_self',
      });
      // On success Cashfree redirects to the return_url configured server-side.
    } catch (e) {
      console.error(e);
      window.toast('❌ ' + e.message, 'err');
      btn.disabled = false;
      btn.textContent = '🔒 Pay ' + window.inr(totals.total);
      if (/Failed to fetch|NetworkError/i.test(e.message)) {
        window.toast('Backend not reachable. Start the server first.', 'err');
      }
    }
  }
})();
