/* Shared UI helpers: cart badge, toast, mobile nav, footer year. */
(function () {
  function updateBadge() {
    const badge = document.getElementById('cartCount');
    if (!badge) return;
    const c = window.Cart ? window.Cart.count() : 0;
    badge.textContent = c;
    badge.style.display = c > 0 ? 'grid' : 'none';
  }

  document.addEventListener('cart:change', updateBadge);
  document.addEventListener('DOMContentLoaded', () => {
    updateBadge();
    updateAuthUI();

    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('mainNav');
    if (toggle && nav) toggle.addEventListener('click', () => nav.classList.toggle('open'));

    const yr = document.getElementById('year');
    if (yr) yr.textContent = new Date().getFullYear();

    // Subtle shadow on the header once the page is scrolled.
    const header = document.getElementById('siteHeader') || document.querySelector('.site-header');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  });

  // Reflect login state in the header (Sign in button → account menu).
  function updateAuthUI() {
    const btn = document.getElementById('signInBtn');
    if (!btn) return;
    const user = window.Auth ? window.Auth.user : null;
    if (user) {
      btn.textContent = '👤 ' + (user.name ? user.name.split(' ')[0] : 'Account');
      btn.onclick = () => { location.href = 'account.html'; };
    } else {
      btn.textContent = 'Sign in';
      btn.onclick = () => { if (window.openAuth) window.openAuth('login'); };
    }
  }
  document.addEventListener('auth:change', updateAuthUI);

  let toastTimer;
  window.toast = function (msg, type) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' toast-' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  };

  // Format INR
  window.inr = n => '₹' + Number(n).toLocaleString('en-IN');

  // Admin-uploaded files live on the BACKEND host. When TUZ_API_BASE is set
  // (split deploy), prefix uploaded asset paths with it. Locally it's "".
  window.assetUrl = function (p) {
    if (!p) return p;
    if (/^https?:\/\//i.test(p)) return p;
    const base = (window.TUZ_API_BASE || '').replace(/\/$/, '');
    return base ? base + '/' + String(p).replace(/^\//, '') : p;
  };

  /** Small currency icon for a game (admin-uploaded). Returns '' if none set. */
  window.currencyIconHTML = function (gameId) {
    const icons = (window.SiteConfig && window.SiteConfig.currencyIcons) || {};
    if (!icons[gameId]) return '';
    return `<img class="cur-ic" src="${window.assetUrl(icons[gameId])}" alt="" />`;
  };

  /* ----- Site config (hero, price overrides, logos) loaded from backend ----- */
  window.SiteConfig = { hero: null, priceOverrides: {}, labelOverrides: {}, logos: {} };
  window.configReady = fetch((window.TUZ_API_BASE || '') + '/api/config')
    .then(r => r.json())
    .then(c => {
      window.SiteConfig = { hero: c.hero || null, priceOverrides: c.priceOverrides || {},
        labelOverrides: c.labelOverrides || {}, logos: c.logos || {}, socials: c.socials || {},
        currencyIcons: c.currencyIcons || {}, siteLogo: c.siteLogo || '' };
      // Apply price + label overrides onto the catalog so all pages reflect admin edits.
      if (window.CATALOG) {
        for (const g of window.CATALOG.games) {
          for (const d of g.denoms) {
            if (Object.prototype.hasOwnProperty.call(window.SiteConfig.priceOverrides, d.sku)) {
              d.price = window.SiteConfig.priceOverrides[d.sku];
            }
            if (Object.prototype.hasOwnProperty.call(window.SiteConfig.labelOverrides, d.sku)) {
              d.label = window.SiteConfig.labelOverrides[d.sku];
            }
          }
        }
      }
      document.dispatchEvent(new CustomEvent('config:ready', { detail: window.SiteConfig }));
      renderFooterSocials();
      renderSiteLogo();
      return window.SiteConfig;
    })
    .catch(() => window.SiteConfig);

  // If the admin uploaded a brand logo, show it in the header (and footer) in
  // place of the default SVG mark.
  function renderSiteLogo() {
    const logo = window.SiteConfig && window.SiteConfig.siteLogo;
    if (!logo) return;
    const url = window.assetUrl ? window.assetUrl(logo) : logo;
    document.querySelectorAll('.brand .brand-mark').forEach(mark => {
      mark.innerHTML = `<img src="${url}" alt="logo" />`;
    });
  }

  // Render footer social icons from config (admin-controlled links).
  function renderFooterSocials() {
    const wrap = document.querySelector('.socials');
    if (!wrap) return;
    const s = (window.SiteConfig && window.SiteConfig.socials) || {};
    const order = ['facebook', 'instagram', 'x', 'youtube', 'discord', 'telegram', 'whatsapp'];
    const map = { facebook: 'fb', instagram: 'ig', x: 'x', youtube: 'yt', discord: 'dc', telegram: 'tg', whatsapp: 'wa' };
    const active = order.filter(k => s[k]);
    if (!active.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    wrap.innerHTML = active.map(k =>
      `<a href="${s[k]}" target="_blank" rel="noopener noreferrer" aria-label="${k}" data-soc="${map[k]}"></a>`).join('');
  }

  /**
   * Cover image with automatic format fallback.
   * If the admin uploaded a logo for this game, that exact file is used first
   * (with a cache-busting version). Otherwise tries png → jpg → webp → svg.
   */
  window.coverHTML = function (id, alt, className) {
    const logos = (window.SiteConfig && window.SiteConfig.logos) || {};
    const base = 'assets/games/' + id;
    let src, startExt;
    if (logos[id]) { src = window.assetUrl(logos[id]); startExt = 'custom'; }
    else { src = base + '.png'; startExt = 'png'; }
    const onerr =
      "var x=['png','jpg','webp','svg'];var i=this.dataset.i==='custom'?-1:+this.dataset.i;i++;" +
      "if(i<x.length){this.dataset.i=i;this.src='" + base + ".'+x[i];}else{this.onerror=null;}";
    return `<img src="${src}" data-i="${startExt === 'custom' ? 'custom' : 0}" alt="${alt || ''}"` +
      (className ? ` class="${className}"` : '') +
      ` loading="lazy" onerror="${onerr}" />`;
  };
})();
