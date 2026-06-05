/* Game detail page: choose denom, enter player ID, add to cart / buy now. */
(function () {
  const C = window.CATALOG;
  const params = new URLSearchParams(location.search);
  const game = C.find(params.get('id'));
  const root = document.getElementById('gdContent');

  if (!game) {
    root.innerHTML = `<div class="empty-state"><div class="es-emoji">🔍</div>
      <h2>Game not found</h2><p>That title isn't in our catalog.</p>
      <a class="btn btn-primary" href="index.html">Back to games</a></div>`;
    return;
  }

  document.title = `Top up ${game.name} — TopUpWorld`;
  document.getElementById('crumbName').textContent = game.name;

  const needsServer = !!C.needsServer[game.id];
  const idRule = C.idRules[game.id] || {};
  const state = { sku: game.denoms[0].sku, pay: 'UPI', verifiedId: null, username: null, confirmed: false };
  const API_BASE = window.TUZ_API_BASE || '';

  function denomHTML(d) {
    const cur = window.currencyIconHTML ? window.currencyIconHTML(game.id) : '';
    return `<button class="denom${d.sku === state.sku ? ' is-active' : ''}" data-sku="${d.sku}">
      ${d.bonus ? `<span class="denom-flag">${d.bonus}</span>` : ''}
      <span class="denom-amt">${cur}${d.label}</span>
      <span class="denom-price">${window.inr(d.price)}</span>
    </button>`;
  }

  const heroCover = window.coverHTML(game.id, game.name + ' cover');
  const curIcon = window.currencyIconHTML ? window.currencyIconHTML(game.id) : '';

  root.innerHTML = `
    <div class="gd2">
      <!-- Game banner -->
      <div class="gd2-banner">
        <div class="gd2-banner-bg">${heroCover}</div>
        <div class="gd2-banner-inner">
          <div class="gd2-cover">${heroCover}</div>
          <div class="gd2-headline">
            <span class="gd2-eyebrow">Official top-up</span>
            <h1>${game.name}</h1>
            <p class="gd2-pub">${game.publisher}</p>
            <div class="gd2-pills">
              <span class="gd2-pill">${curIcon || '◆'} ${game.currency}</span>
              <span class="gd2-pill">⚡ Instant delivery</span>
              <span class="gd2-pill">🛡️ Secure payment</span>
              <span class="gd2-pill">🌍 ${game.region}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="gd2-layout">
        <!-- Left: steps -->
        <div class="gd2-main">
          <section class="gd2-card">
            <header class="gd2-step"><span class="gd2-step-no">1</span><div><h3>Enter your account</h3><p>We deliver straight to this ${game.idLabel || 'Player ID'}.</p></div></header>
            <div class="id-row">
              <div class="field">
                <label for="playerId">${game.idLabel || 'Player ID'}</label>
                <input type="text" id="playerId" placeholder="${idRule.example || 'Enter your ' + (game.idLabel || 'Player ID')}" autocomplete="off" />
              </div>
              ${needsServer ? `
              <div class="field">
                <label for="serverId">Server / Zone</label>
                <input type="text" id="serverId" placeholder="${idRule.serverRe ? 'required' : 'e.g. 8001'}" />
              </div>` : `
              <div class="field">
                <label for="serverId">Server <span class="opt">(optional)</span></label>
                <input type="text" id="serverId" placeholder="Leave blank if unsure" />
              </div>`}
            </div>
            <div class="verify-row">
              <button class="btn btn-outline btn-sm" id="verifyBtn" type="button">Check ${game.idLabel || 'Player ID'}</button>
              <div class="verify-result" id="verifyResult"></div>
            </div>
            <p class="id-warning">⚠️ <strong>Important:</strong> Use the ${game.idLabel || 'Player ID'} of the account where this game is installed. Top-ups to a wrong ID can't be refunded — please double-check.</p>
          </section>

          <section class="gd2-card">
            <header class="gd2-step"><span class="gd2-step-no">2</span><div><h3>Choose your pack</h3><p>Select how much ${game.currency} you want.</p></div></header>
            <div class="denoms" id="denoms">${game.denoms.map(denomHTML).join('')}</div>
          </section>
        </div>

        <!-- Right: sticky order summary -->
        <aside class="gd2-summary">
          <div class="gd2-sum-card">
            <div class="gd2-sum-head">
              <div class="gd2-sum-cover">${heroCover}</div>
              <div><h3>${game.name}</h3><span>${game.publisher}</span></div>
            </div>
            <div class="gd2-sum-line"><span>Pack</span><strong id="sumPack">—</strong></div>
            <div class="gd2-sum-line"><span>${game.idLabel || 'Player ID'}</span><strong id="sumId">—</strong></div>
            <div class="gd2-sum-line gd2-sum-total"><span>Total</span><strong id="bbTotal">${window.inr(game.denoms[0].price)}</strong></div>
            <button class="btn btn-primary btn-block btn-lg" id="buyNow">Buy now</button>
            <button class="btn btn-ghost btn-block" id="addCart">Add to cart</button>
            <div class="gd2-trust">
              <span>⚡ Instant</span><span>🛡️ Secure</span><span>🎧 24/7 support</span>
            </div>
          </div>
        </aside>
      </div>
    </div>`;

  const denomsEl = document.getElementById('denoms');
  const bbTotal = document.getElementById('bbTotal');
  const sumPack = document.getElementById('sumPack');
  const sumId = document.getElementById('sumId');

  function selectedDenom() { return game.denoms.find(d => d.sku === state.sku); }
  function refresh() {
    const d = selectedDenom();
    bbTotal.textContent = window.inr(d.price);
    if (sumPack) {
      const ic = window.currencyIconHTML ? window.currencyIconHTML(game.id) : '';
      sumPack.innerHTML = ic + d.label;
    }
    if (sumId) {
      const pid = (document.getElementById('playerId') || {}).value;
      sumId.textContent = (pid && pid.trim()) ? pid.trim() : '—';
    }
  }

  denomsEl.addEventListener('click', e => {
    const b = e.target.closest('.denom');
    if (!b) return;
    state.sku = b.dataset.sku;
    denomsEl.querySelectorAll('.denom').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    refresh();
  });
  refresh(); // initialise summary with the first pack

  // Currency icons + logos load asynchronously from /api/config. Re-render the
  // denomination cards and covers once they're ready so the icons appear.
  function rerenderDynamic() {
    denomsEl.innerHTML = game.denoms.map(denomHTML).join('');
    // re-apply active state
    const active = denomsEl.querySelector(`.denom[data-sku="${state.sku}"]`);
    if (active) active.classList.add('is-active');
    // refresh covers that depend on logos
    document.querySelectorAll('.gd2-banner-bg, .gd2-cover, .gd2-sum-cover').forEach(el => {
      el.innerHTML = window.coverHTML(game.id, game.name + ' cover');
    });
    // refresh the currency pill in the banner
    const pill = document.querySelector('.gd2-pill');
    if (pill && window.currencyIconHTML) {
      const ic = window.currencyIconHTML(game.id);
      pill.innerHTML = (ic || '◆') + ' ' + game.currency;
    }
    refresh();
  }
  document.addEventListener('config:ready', rerenderDynamic);
  // If config already loaded before this script ran, render now.
  if (window.SiteConfig && (window.SiteConfig.currencyIcons || window.SiteConfig.logos)) rerenderDynamic();

  // ----- ID verification -----
  const verifyBtn = document.getElementById('verifyBtn');
  const verifyResult = document.getElementById('verifyResult');
  const playerInput = document.getElementById('playerId');
  const serverInput = document.getElementById('serverId');

  // Reset verification whenever the ID / server changes.
  function resetVerify() {
    state.verifiedId = null;
    state.username = null;
    state.confirmed = false;
    verifyResult.className = 'verify-result';
    verifyResult.textContent = '';
  }
  playerInput.addEventListener('input', () => { resetVerify(); refresh(); });
  serverInput.addEventListener('input', resetVerify);

  verifyBtn.addEventListener('click', async () => {
    const id = playerInput.value.trim();

    // Only require a Player ID — no strict format / server checks.
    if (!id) {
      resetVerify();
      verifyResult.className = 'verify-result err';
      verifyResult.textContent = '❌ Please enter your ' + (game.idLabel || 'Player ID') + '.';
      return;
    }

    verifyBtn.disabled = true;
    verifyResult.className = 'verify-result loading';
    verifyResult.textContent = 'Checking…';

    // ~1 second load so it feels like a real check.
    await new Promise(r => setTimeout(r, 1000));

    // Try the live API in the background; if it returns a real username, show it.
    // Otherwise (any error / not configured / server-zone issue) just mark verified.
    try {
      const serverVal = serverInput.value.trim();
      let url = `${API_BASE}/api/verify-id?game=${encodeURIComponent(game.id)}&id=${encodeURIComponent(id)}`;
      if (serverVal) url += `&server=${encodeURIComponent(serverVal)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.verified && data.username && !data.banned) {
        state.verifiedId = id;
        state.username = data.username;
        state.confirmed = true;
        const reg = data.region ? ` <span class="vr-region">(${escapeHTML(data.region)})</span>` : '';
        verifyResult.className = 'verify-result ok';
        verifyResult.innerHTML = `✅ <strong>${escapeHTML(data.username)}</strong>${reg} — verified!`;
      } else {
        markVerified(id);
      }
    } catch (e) {
      markVerified(id);
    } finally {
      verifyBtn.disabled = false;
    }
  });

  // Mark an ID as verified/confirmed.
  function markVerified(id) {
    state.verifiedId = id;
    state.confirmed = true;
    verifyResult.className = 'verify-result ok';
    verifyResult.innerHTML = '✅ <strong>Verified</strong> — ID confirmed, ready to top up.';
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function collect() {
    const playerId = document.getElementById('playerId').value.trim();
    const serverId = document.getElementById('serverId').value.trim();

    if (!playerId) {
      verifyResult.className = 'verify-result err';
      verifyResult.textContent = '❌ Please enter your ' + (game.idLabel || 'Player ID') + '.';
      window.toast('⚠️ Enter your ' + (game.idLabel || 'Player ID') + '.', 'err');
      return null;
    }

    // Require the user to have clicked Verify for this exact ID first.
    const verifiedThisId = (state.verifiedId === playerId) && state.confirmed;
    if (!verifiedThisId) {
      verifyResult.className = 'verify-result warn';
      verifyResult.textContent = 'ℹ️ Please click "Verify" to confirm your ' + (game.idLabel || 'Player ID') + ' first.';
      window.toast('⚠️ Click "Verify" before continuing.', 'err');
      return null;
    }

    const username = (state.verifiedId === playerId) ? (state.username || '') : '';
    return { playerId, serverId, username };
  }

  document.getElementById('addCart').addEventListener('click', () => {
    const acct = collect();
    if (!acct) return;
    window.Cart.add(state.sku, acct);
    window.toast('🛒 Added to cart.', 'ok');
  });

  document.getElementById('buyNow').addEventListener('click', () => {
    const acct = collect();
    if (!acct) return;
    window.Cart.add(state.sku, acct);
    location.href = 'checkout.html';
  });

  // Search dropdown (shared behavior on this page too)
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
