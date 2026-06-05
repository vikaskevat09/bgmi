/* Account page: profile, saved game IDs, order history. */
(function () {
  const C = window.CATALOG;
  const root = document.getElementById('accountContent');

  const STATUS_LABEL = {
    SUCCESS: ['Delivered', 'st-ok'],
    CREATED: ['Pending payment', 'st-pending'],
    FAILED: ['Failed', 'st-fail'],
    USER_DROPPED: ['Cancelled', 'st-fail'],
  };

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return ''; }
  }

  async function render() {
    const user = await window.Auth.me(true);
    if (!user) {
      root.innerHTML = `
        <div class="empty-state">
          <div class="es-emoji">🔐</div>
          <h2>Please sign in</h2>
          <p>Sign in to see your saved IDs and order history.</p>
          <button class="btn btn-primary btn-lg" id="goSignIn">Sign in / Create account</button>
        </div>`;
      document.getElementById('goSignIn').addEventListener('click', () => window.openAuth('login'));
      return;
    }

    const [savedIds, orders] = await Promise.all([window.Auth.getSavedIds(), window.Auth.myOrders()]);

    root.innerHTML = `
      <div class="account-head">
        <div class="account-avatar">${(user.name || user.email)[0].toUpperCase()}</div>
        <div>
          <h1>Hi, ${escapeHTML(user.name || 'gamer')} 👋</h1>
          <p class="muted">${escapeHTML(user.email)}</p>
        </div>
        <button class="btn btn-ghost" id="logoutBtn">Sign out</button>
      </div>

      <div class="account-grid">
        <section class="panel">
          <div class="panel-title">💾 Saved Player IDs</div>
          <div id="savedList">
            ${savedIds.length ? savedIds.map((s, i) => savedRow(s, i)).join('')
              : '<p class="muted" style="font-size:.9rem">No saved IDs yet. They\'re saved automatically when you top up.</p>'}
          </div>
        </section>

        <section class="panel">
          <div class="panel-title">🧾 Order history</div>
          <div id="orderList">
            ${orders.length ? orders.map(orderRow).join('')
              : '<p class="muted" style="font-size:.9rem">No orders yet. <a href="index.html#games" style="color:var(--orange)">Browse games →</a></p>'}
          </div>
        </section>
      </div>`;

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await window.Auth.logout();
      window.toast('Signed out.');
      render();
    });

    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      await window.Auth.removeSavedId(+b.dataset.del);
      window.toast('Saved ID removed.');
      render();
    }));

    root.querySelectorAll('[data-topup]').forEach(b => b.addEventListener('click', () => {
      location.href = 'game.html?id=' + b.dataset.topup;
    }));
  }

  function savedRow(s, i) {
    const g = C.find(s.game);
    return `
      <div class="saved-row">
        ${window.coverHTML(s.game, '')}
        <div class="saved-info">
          <strong>${g ? g.name : s.game}</strong>
          <span>${g ? g.idLabel : 'ID'}: ${escapeHTML(s.playerId)}${s.serverId ? ' • ' + escapeHTML(s.serverId) : ''}</span>
          ${s.username ? `<em>${escapeHTML(s.username)}</em>` : ''}
        </div>
        <div class="saved-actions">
          <button class="btn btn-primary btn-sm" data-topup="${s.game}">Top up</button>
          <button class="cr-remove" data-del="${i}">Remove</button>
        </div>
      </div>`;
  }

  function orderRow(o) {
    const [label, cls] = STATUS_LABEL[o.status] || [o.status, 'st-pending'];
    const items = (o.items || []).map(l => `${l.qty}× ${l.sku}`).join(', ');
    return `
      <div class="order-row">
        <div class="order-main">
          <strong>#${o.orderId}</strong>
          <span class="muted">${items}</span>
          <span class="muted" style="font-size:.8rem">${fmtDate(o.createdAt)}</span>
        </div>
        <div class="order-right">
          <span class="order-amt">${window.inr(o.amount)}</span>
          <span class="status-pill ${cls}">${label}</span>
        </div>
      </div>`;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  render();
})();
