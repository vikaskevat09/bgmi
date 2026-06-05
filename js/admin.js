/* Admin panel: login + prices, logos, hero management. */
(function () {
  const API = window.TUZ_API_BASE || '';
  const C = window.CATALOG;
  const $ = id => document.getElementById(id);
  const assetUrl = p => (p && API && !/^https?:\/\//i.test(p)) ? API.replace(/\/$/, '') + '/' + String(p).replace(/^\//, '') : p;

  // Self-contained toast (admin page doesn't load ui.js).
  if (typeof window.toast !== 'function') {
    let _tt;
    window.toast = function (msg, type) {
      let t = document.getElementById('toast');
      if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
      t.textContent = msg;
      t.className = 'toast show' + (type ? ' toast-' + type : '');
      clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), 3200);
    };
  }
  window.inr = window.inr || (n => '₹' + Number(n).toLocaleString('en-IN'));

  /* ---------- helpers ---------- */
  async function api(method, path, body) {
    const opt = { method, credentials: 'include', headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(API + path, opt);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || ('Request failed (' + r.status + ')'));
    return data;
  }
  function saved(msg) {
    const el = $('adminSaved'); el.textContent = msg || '✓ Saved'; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function cover(id) {
    const base = 'assets/games/' + id;
    return `<img src="${base}.png" alt="" loading="lazy" onerror="var x=['jpg','webp','svg'];var i=+(this.dataset.i||0);if(i&lt;x.length){this.dataset.i=i+1;this.src='${base}.'+x[i];}else{this.onerror=null;}">`;
  }

  /* ---------- auth ---------- */
  async function checkAuth() {
    try { const d = await api('GET', '/api/admin/check'); return d.admin; } catch { return false; }
  }
  function showLogin() { $('adminLogin').style.display = 'grid'; $('adminShell').style.display = 'none'; }
  function showShell() { $('adminLogin').style.display = 'none'; $('adminShell').style.display = 'grid'; switchView('prices'); }

  $('adminLoginBtn').addEventListener('click', doLogin);
  $('adminPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  async function doLogin() {
    const password = $('adminPass').value;
    if (!password) { window.toast('⚠️ Enter the password.', 'err'); return; }
    try {
      await api('POST', '/api/admin/login', { password });
      window.toast('✅ Welcome, admin.', 'ok');
      showShell();
    } catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
  }
  $('adminLogout').addEventListener('click', async () => {
    try { await api('POST', '/api/admin/logout'); } catch {}
    showLogin();
  });

  /* ---------- view switching ---------- */
  document.querySelectorAll('.admin-tab').forEach(t =>
    t.addEventListener('click', () => switchView(t.dataset.view)));
  function switchView(view) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === view));
    $('adminViewTitle').textContent = { prices: 'Prices', logos: 'Game Logos', hero: 'Hero Banners', brand: 'Site Logo', socials: 'Social Links' }[view];
    if (view === 'prices') renderPrices();
    else if (view === 'logos') renderLogos();
    else if (view === 'hero') renderHero();
    else if (view === 'brand') renderBrand();
    else if (view === 'socials') renderSocials();
  }

  /* ---------- PRICES + QUANTITY (labels) ---------- */
  async function renderPrices() {
    const view = $('adminView');
    let overrides = {}, labels = {};
    try { const d = await api('GET', '/api/admin/prices'); overrides = d.overrides || {}; labels = d.labels || {}; } catch {}
    view.innerHTML = `
      <div class="admin-card">
        <h3>Edit packs — quantity &amp; price</h3>
        <p class="admin-hint">Change the <strong>quantity offered</strong> (e.g. "100 Diamonds") and the <strong>price</strong> (₹) for any pack, then click Save. Changes apply to the live store and real charges immediately. Reset returns a pack to its defaults.</p>
        ${C.games.map(g => priceGameHTML(g, overrides, labels)).join('')}
      </div>`;

    view.querySelectorAll('.price-game-head').forEach(h =>
      h.addEventListener('click', () => h.parentElement.classList.toggle('open')));

    view.querySelectorAll('[data-save-sku]').forEach(btn => btn.addEventListener('click', async () => {
      const sku = btn.dataset.saveSku;
      const priceInput = view.querySelector(`input[data-price="${sku}"]`);
      const labelInput = view.querySelector(`input[data-label="${sku}"]`);
      const price = parseInt(priceInput.value, 10);
      const label = labelInput.value.trim();
      if (!Number.isFinite(price) || price < 0) { window.toast('⚠️ Enter a valid price.', 'err'); return; }
      if (!label) { window.toast('⚠️ Quantity cannot be empty.', 'err'); return; }
      try {
        await api('POST', '/api/admin/pack/' + encodeURIComponent(sku), { price, label });
        saved('✓ ' + sku + ' updated');
        renderPrices();
      } catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
    }));

    view.querySelectorAll('[data-reset-sku]').forEach(btn => btn.addEventListener('click', async () => {
      try { await api('DELETE', '/api/admin/pack/' + encodeURIComponent(btn.dataset.resetSku)); saved('✓ Reset'); renderPrices(); }
      catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
    }));
  }

  function priceGameHTML(g, overrides, labels) {
    return `<div class="price-game">
      <div class="price-game-head">
        ${cover(g.id)}
        <h4>${esc(g.name)} <small style="color:var(--muted);font-weight:500">· ${esc(g.publisher)}</small></h4>
        <span class="chev">▶</span>
      </div>
      <div class="price-rows">
        ${g.denoms.map(d => {
          const customPrice = Object.prototype.hasOwnProperty.call(overrides, d.sku);
          const customLabel = Object.prototype.hasOwnProperty.call(labels, d.sku);
          const custom = customPrice || customLabel;
          const price = customPrice ? overrides[d.sku] : d.price;
          const label = customLabel ? labels[d.sku] : d.label;
          return `<div class="price-row">
            <div class="pr-fields">
              <div class="pr-field">
                <label>Quantity offered</label>
                <input type="text" data-label="${d.sku}" value="${esc(label)}" placeholder="e.g. 100 Diamonds">
              </div>
              <div class="pr-field pr-field-price">
                <label>Price</label>
                <div class="price-input"><span>₹</span><input type="number" min="0" data-price="${d.sku}" value="${price}"></div>
              </div>
            </div>
            <div class="pr-meta">
              <span class="pr-sku">${esc(d.sku)}</span>
              <span class="pr-badge ${custom ? 'custom' : 'default'}">${custom ? 'custom' : 'default'}</span>
            </div>
            <div class="pr-actions">
              <button class="btn btn-primary btn-sm" data-save-sku="${d.sku}">Save</button>
              ${custom ? `<button class="btn btn-ghost btn-sm" data-reset-sku="${d.sku}">Reset</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  /* ---------- LOGOS + CURRENCY ICONS ---------- */
  async function renderLogos() {
    const view = $('adminView');
    let logos = {}, currencyIcons = {};
    try { const c = await api('GET', '/api/config'); logos = c.logos || {}; currencyIcons = c.currencyIcons || {}; } catch {}
    view.innerHTML = `
      <div class="admin-card">
        <h3>Game logos &amp; currency icons</h3>
        <p class="admin-hint">Upload a <strong>cover logo</strong> (portrait, max 5MB) and a small <strong>currency icon</strong> (PNG/WEBP, shown next to the amount in the cart, max 2MB). Only use artwork you are licensed to use.</p>
        <div class="logo-grid">
          ${C.games.map(g => `
            <div class="logo-card">
              <div class="logo-thumb">${cover(g.id)}</div>
              <div class="logo-info">
                <h4>${esc(g.name)}</h4>
                <p>${logos[g.id] ? 'Custom logo set' : 'Using placeholder'} · ${currencyIcons[g.id] ? 'currency icon set' : 'no currency icon'}</p>
                <div class="logo-actions">
                  <button class="btn btn-primary" data-upload="${g.id}">Logo</button>
                  ${logos[g.id] ? `<button class="btn btn-ghost" data-remove-logo="${g.id}">✕</button>` : ''}
                </div>
                <div class="logo-actions" style="margin-top:.4rem">
                  <button class="btn btn-ghost" data-cur="${g.id}">
                    ${currencyIcons[g.id] ? `<img src="${assetUrl(currencyIcons[g.id])}" style="width:16px;height:16px;vertical-align:-3px;margin-right:4px">` : ''}Currency icon
                  </button>
                  ${currencyIcons[g.id] ? `<button class="btn btn-ghost" data-remove-cur="${g.id}">✕</button>` : ''}
                </div>
              </div>
            </div>`).join('')}
        </div>
        <input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" style="display:none" />
        <input type="file" id="curFile" accept="image/png,image/webp" style="display:none" />
      </div>`;

    const fileInput = $('logoFile');
    const curInput = $('curFile');
    let targetGame = null, curTarget = null;

    view.querySelectorAll('[data-upload]').forEach(b => b.addEventListener('click', () => {
      targetGame = b.dataset.upload; fileInput.value = ''; fileInput.click();
    }));
    view.querySelectorAll('[data-remove-logo]').forEach(b => b.addEventListener('click', async () => {
      try { await api('DELETE', '/api/admin/logo/' + b.dataset.removeLogo); saved('✓ Logo removed'); renderLogos(); }
      catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
    }));
    view.querySelectorAll('[data-cur]').forEach(b => b.addEventListener('click', () => {
      curTarget = b.dataset.cur; curInput.value = ''; curInput.click();
    }));
    view.querySelectorAll('[data-remove-cur]').forEach(b => b.addEventListener('click', async () => {
      try { await api('DELETE', '/api/admin/currency/' + b.dataset.removeCur); saved('✓ Currency icon removed'); renderLogos(); }
      catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
    }));

    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file || !targetGame) return;
      if (file.size > 5 * 1024 * 1024) { window.toast('⚠️ Image too large (max 5MB).', 'err'); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        try { await api('POST', '/api/admin/logo/' + targetGame, { dataUrl: reader.result }); saved('✓ Logo uploaded'); renderLogos(); }
        catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
      };
      reader.readAsDataURL(file);
    };

    curInput.onchange = () => {
      const file = curInput.files[0];
      if (!file || !curTarget) return;
      if (file.size > 2 * 1024 * 1024) { window.toast('⚠️ Icon too large (max 2MB).', 'err'); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        try { await api('POST', '/api/admin/currency/' + curTarget, { dataUrl: reader.result }); saved('✓ Currency icon uploaded'); renderLogos(); }
        catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
      };
      reader.readAsDataURL(file);
    };
  }

  /* ---------- HERO (image upload only) ---------- */
  async function renderHero() {
    const view = $('adminView');
    let hero = [];
    try { hero = (await api('GET', '/api/admin/hero')).hero || []; } catch {}
    view.innerHTML = `
      <div class="admin-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.6rem">
          <h3 style="margin:0">Hero banners (${hero.length})</h3>
          <button class="btn btn-primary" id="addHeroImg">+ Upload banner</button>
        </div>
        <p class="admin-hint">Upload wide banner images (recommended ~1440×460, max 6MB). They fill the homepage hero and rotate automatically. If no banners are uploaded, the hero is hidden.</p>
        <div class="hero-img-grid">
          ${hero.length ? hero.map(heroItemHTML).join('') : '<p class="muted">No banners yet. Upload one to show the hero.</p>'}
        </div>
        <input type="file" id="heroFile" accept="image/png,image/jpeg,image/webp" style="display:none" />
      </div>`;

    const fileInput = $('heroFile');
    $('addHeroImg').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });

    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) { window.toast('⚠️ Image too large (max 6MB).', 'err'); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        try { await api('POST', '/api/admin/hero', { dataUrl: reader.result }); saved('✓ Banner uploaded'); renderHero(); }
        catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
      };
      reader.readAsDataURL(file);
    };

    view.querySelectorAll('[data-del-hero]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this banner?')) return;
      try { await api('DELETE', '/api/admin/hero/' + btn.dataset.delHero); saved('✓ Banner deleted'); renderHero(); }
      catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
    }));
  }

  function heroItemHTML(s) {
    return `<div class="hero-img-card">
      <img src="${assetUrl(esc(s.image))}" alt="Hero banner" />
      <button class="hero-img-del" data-del-hero="${s.id}" title="Delete banner">✕ Delete</button>
    </div>`;
  }

  /* ---------- SOCIAL LINKS ---------- */
  async function renderSocials() {
    const view = $('adminView');
    let socials = {};
    try { socials = (await api('GET', '/api/admin/socials')).socials || {}; } catch {}
    const PLATFORMS = [
      ['facebook', 'Facebook', 'https://facebook.com/yourpage'],
      ['instagram', 'Instagram', 'https://instagram.com/yourhandle'],
      ['x', 'X (Twitter)', 'https://x.com/yourhandle'],
      ['youtube', 'YouTube', 'https://youtube.com/@yourchannel'],
      ['discord', 'Discord', 'https://discord.gg/invite'],
      ['telegram', 'Telegram', 'https://t.me/yourchannel'],
      ['whatsapp', 'WhatsApp', 'https://wa.me/91XXXXXXXXXX'],
    ];
    view.innerHTML = `
      <div class="admin-card">
        <h3>Footer social media links</h3>
        <p class="admin-hint">Paste the full URL for each platform you want shown in the site footer. Leave a field empty to hide that icon. Click Save links.</p>
        <div class="social-rows">
          ${PLATFORMS.map(([k, label, ph]) => `
            <div class="social-row">
              <label>${label}</label>
              <input type="url" data-social="${k}" value="${esc(socials[k] || '')}" placeholder="${ph}">
            </div>`).join('')}
        </div>
        <button class="btn btn-primary" id="saveSocials" style="margin-top:1rem">Save links</button>
      </div>`;

    $('saveSocials').addEventListener('click', async () => {
      const map = {};
      view.querySelectorAll('[data-social]').forEach(i => map[i.dataset.social] = i.value.trim());
      try { await api('POST', '/api/admin/socials', { socials: map }); saved('✓ Social links saved'); }
      catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
    });
  }

  /* ---------- SITE (BRAND) LOGO ---------- */
  async function renderBrand() {
    const view = $('adminView');
    let siteLogo = '';
    try { siteLogo = (await api('GET', '/api/config')).siteLogo || ''; } catch {}
    view.innerHTML = `
      <div class="admin-card">
        <h3>Website logo</h3>
        <p class="admin-hint">Upload your brand logo (PNG/WEBP/SVG, transparent background works best, max 2MB). It replaces the default mark in the header and footer across the site. Recommended height ~80px (wide logo e.g. 240×80).</p>
        <div class="brand-preview" id="brandPreview">
          ${siteLogo
            ? `<img src="${assetUrl(siteLogo)}" alt="Current logo" />`
            : '<span class="brand-none">No custom logo — using the default mark.</span>'}
        </div>
        <div class="logo-actions" style="margin-top:1rem">
          <button class="btn btn-primary" id="brandUpload">Upload logo</button>
          ${siteLogo ? '<button class="btn btn-ghost" id="brandRemove">Remove logo</button>' : ''}
        </div>
        <input type="file" id="brandFile" accept="image/png,image/webp,image/svg+xml,image/jpeg" style="display:none" />
      </div>`;

    const fileInput = $('brandFile');
    $('brandUpload').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
    const rm = $('brandRemove');
    if (rm) rm.addEventListener('click', async () => {
      try { await api('DELETE', '/api/admin/site-logo'); saved('✓ Logo removed'); renderBrand(); }
      catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
    });
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { window.toast('⚠️ Logo too large (max 2MB).', 'err'); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        try { await api('POST', '/api/admin/site-logo', { dataUrl: reader.result }); saved('✓ Logo uploaded'); renderBrand(); }
        catch (e) { window.toast('⚠️ ' + e.message, 'err'); }
      };
      reader.readAsDataURL(file);
    };
  }

  /* ---------- boot ---------- */
  (async function init() {
    if (await checkAuth()) showShell();
    else showLogin();
  })();
})();
