/* Home page: game grid, search, filters, vouchers, trending, reviews, FAQ,
   hero slider, login modal. */
(function () {
  const C = window.CATALOG;
  const state = { cat: 'all' };
  const grid = document.getElementById('gamesGrid');

  // Category chips from catalog
  const filtersEl = document.getElementById('catFilters');
  if (filtersEl && C.categories) {
    filtersEl.innerHTML = C.categories.map((c, i) =>
      `<button class="chip${i === 0 ? ' active' : ''}" data-cat="${c.key}">${c.label}</button>`).join('');
  }

  function cardHTML(g) {
    return `
      <a class="game-card" href="game.html?id=${g.id}">
        <div class="game-thumb">
          ${g.badge ? `<span class="game-badge">${g.badge}</span>` : ''}
          ${window.coverHTML(g.id, g.name + ' cover')}
          <span class="quick">Top up now →</span>
        </div>
        <div class="game-meta"><h3>${g.name}</h3><p>${g.publisher}</p></div>
      </a>`;
  }

  let autoTimer = null;
  function render() {
    const list = C.games.filter(g => state.cat === 'all' || g.category === state.cat);
    grid.innerHTML = list.map(cardHTML).join('');
    startAuto();
  }

  // Horizontal scroll controls for the games rail.
  function scrollByCards(dir) {
    const card = grid.querySelector('.game-card');
    const step = card ? (card.offsetWidth + 20) * 2 : 400;
    grid.scrollBy({ left: dir * step, behavior: 'smooth' });
  }
  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      if (!grid.children.length) return;
      const atEnd = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 8;
      if (atEnd) grid.scrollTo({ left: 0, behavior: 'smooth' });
      else scrollByCards(1);
    }, 2000);
  }
  const prevBtn = document.getElementById('gamesPrev');
  const nextBtn = document.getElementById('gamesNext');
  if (prevBtn) prevBtn.addEventListener('click', () => { scrollByCards(-1); startAuto(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { scrollByCards(1); startAuto(); });
  // Pause autoslide while hovering / interacting.
  [grid, prevBtn, nextBtn].forEach(el => el && el.addEventListener('mouseenter', () => clearInterval(autoTimer)));
  [grid, prevBtn, nextBtn].forEach(el => el && el.addEventListener('mouseleave', startAuto));

  render();

  // Re-render once admin price overrides are applied from config.
  document.addEventListener('config:ready', () => { render(); buildTrending(); });

  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    state.cat = btn.dataset.cat;
    render();
  });

  // ----- Trending rail (first 8 games as horizontal scroller) -----
  const rail = document.getElementById('trendingRail');
  function buildTrending() {
    if (!rail) return;
    const trending = C.games.slice(0, 8);
    rail.innerHTML = trending.map((g, i) => `
      <a class="trend-card" href="game.html?id=${g.id}">
        <span class="trend-rank">#${i + 1}</span>
        ${window.coverHTML(g.id, g.name)}
        <div class="trend-meta"><h3>${g.name}</h3><p>from ${window.inr(g.denoms[0].price)}</p></div>
      </a>`).join('');
  }
  buildTrending();

  // Trending rail scroll buttons
  function railScroll(el, dir) {
    const card = el.querySelector('.trend-card');
    const step = card ? (card.offsetWidth + 18) * 2 : 360;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }
  const trendPrev = document.getElementById('trendPrev');
  const trendNext = document.getElementById('trendNext');
  if (trendPrev) trendPrev.addEventListener('click', () => { railScroll(rail, -1); startTrendAuto(); });
  if (trendNext) trendNext.addEventListener('click', () => { railScroll(rail, 1); startTrendAuto(); });

  // Auto-slide the trending rail every 2 seconds (loops back at the end).
  let trendTimer = null;
  function startTrendAuto() {
    clearInterval(trendTimer);
    trendTimer = setInterval(() => {
      if (!rail || !rail.children.length) return;
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
      if (atEnd) rail.scrollTo({ left: 0, behavior: 'smooth' });
      else railScroll(rail, 1);
    }, 2000);
  }
  if (rail) {
    startTrendAuto();
    rail.addEventListener('mouseenter', () => clearInterval(trendTimer));
    rail.addEventListener('mouseleave', startTrendAuto);
  }

  // ----- Exclusive offers (selected games at a discount) -----
  // Each entry: game id + percent off applied to that game's first pack.
  const OFFERS = [
    { id: 'free-fire', off: 15, tag: 'WEEKEND DEAL' },
    { id: 'bgmi', off: 12, tag: 'LIMITED' },
    { id: 'mobile-legends', off: 20, tag: 'MEGA SALE' },
    { id: 'genshin-impact', off: 10, tag: 'NEW USER' },
    { id: 'valorant', off: 18, tag: 'FLASH' },
  ];
  const offersGrid = document.getElementById('offersGrid');
  function buildOffers() {
    if (!offersGrid) return;
    offersGrid.innerHTML = OFFERS.map(o => {
      const g = C.find(o.id);
      if (!g) return '';
      const base = g.denoms[0].price;
      const deal = Math.round(base * (1 - o.off / 100));
      return `
        <a class="offer-card" href="game.html?id=${g.id}">
          <div class="offer-thumb">
            <span class="offer-badge">-${o.off}%</span>
            <span class="offer-tag">${o.tag}</span>
            ${window.coverHTML(g.id, g.name)}
          </div>
          <div class="offer-meta">
            <h3>${g.name}</h3>
            <p>${g.publisher}</p>
            <div class="offer-price">
              <span class="op-deal">${window.inr(deal)}</span>
              <span class="op-base">${window.inr(base)}</span>
            </div>
          </div>
        </a>`;
    }).join('');
  }
  buildOffers();
  document.addEventListener('config:ready', buildOffers);

  // ----- Header search dropdown -----
  const search = document.getElementById('headerSearch');
  const results = document.getElementById('searchResults');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { results.classList.remove('open'); return; }
    const matches = C.games.filter(g => g.name.toLowerCase().includes(q)).slice(0, 6);
    results.innerHTML = matches.length
      ? matches.map(g => `
          <a href="game.html?id=${g.id}">
            ${window.coverHTML(g.id, '')}
            <div><div class="sr-name">${g.name}</div><div class="sr-pub">${g.publisher}</div></div>
          </a>`).join('')
      : '<div style="padding:.8rem;color:var(--muted);font-size:.88rem">No games found.</div>';
    results.classList.add('open');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.header-search')) results.classList.remove('open');
  });

  // ----- Vouchers (purchasable) -----
  const vg = document.getElementById('vouchersGrid');
  function renderVouchers() {
    vg.innerHTML = C.vouchers.map(v =>
      `<div class="voucher-card" style="background:${v.grad}">
         <div class="vc-top"><span class="vc-tag">${v.bonus || ''}</span><h3>${v.name}</h3></div>
         <div class="vc-amt">${v.label}</div>
         <div class="vc-foot">
           <span class="vc-price">${window.inr(v.price)}</span>
           <button class="btn btn-light btn-sm" data-buy-voucher="${v.sku}">Buy</button>
         </div>
       </div>`).join('');
  }
  renderVouchers();
  vg.addEventListener('click', e => {
    const btn = e.target.closest('[data-buy-voucher]');
    if (!btn) return;
    window.Cart.add(btn.dataset.buyVoucher, { qty: 1 });
    // Go straight to checkout for vouchers.
    location.href = 'checkout.html';
  });

  // ----- Reviews -----
  const REVIEWS = [
    { name: 'Rahul S.',  game: 'Free Fire',      stars: 5, text: 'Diamonds came through in like 10 seconds. Smoothest top-up site I\'ve used.' },
    { name: 'Aisha K.',  game: 'BGMI',           stars: 5, text: 'UC delivered instantly and the price was lower than the in-game store. Will use again.' },
    { name: 'Vikram R.', game: 'Mobile Legends', stars: 5, text: 'Loved that it showed my username before paying. Felt safe the whole time.' },
    { name: 'Neha P.',   game: 'Genshin Impact', stars: 4, text: 'Quick UPI payment, crystals arrived right away. Support replied fast too.' },
  ];
  const rev = document.getElementById('reviewsGrid');
  if (rev) {
    rev.innerHTML = REVIEWS.map(r => `
      <div class="review-card">
        <div class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
        <p class="review-text">"${r.text}"</p>
        <div class="review-by"><span class="review-av">${r.name[0]}</span>
          <div><strong>${r.name}</strong><small>${r.game}</small></div>
        </div>
      </div>`).join('');
  }

  // ----- FAQ -----
  const FAQS = [
    ['How fast is delivery?', 'Most top-ups are delivered to your game account within a few seconds of a successful payment. Larger orders may take a couple of minutes.'],
    ['Do you need my account password?', 'Never. We only need your Player/Character ID (and server for some games). Anyone asking for your game password is a scam.'],
    ['What payment methods can I use?', 'All major methods via Cashfree — UPI, credit/debit cards (Visa, Mastercard, RuPay), net banking and popular wallets.'],
    ['What if I entered the wrong ID?', 'We verify your ID and show your username before payment. Once a top-up is delivered it can\'t be reversed, so please double-check.'],
    ['Is this safe and legal?', 'Yes. Payments are encrypted and processed by Cashfree, a licensed payment gateway. We never store your card details.'],
  ];
  const faqList = document.getElementById('faqList');
  if (faqList) {
    faqList.innerHTML = FAQS.map(([q, a]) => `
      <div class="faq-item">
        <button class="faq-q" type="button">${q}<span class="faq-ic">+</span></button>
        <div class="faq-a"><p>${a}</p></div>
      </div>`).join('');
    faqList.addEventListener('click', e => {
      const q = e.target.closest('.faq-q');
      if (!q) return;
      const item = q.parentElement;
      const open = item.classList.contains('open');
      faqList.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!open) item.classList.add('open');
    });
  }

  // ----- Hero slider (uploaded images that fill the hero) -----
  function heroSlideHTML(s, active) {
    return `<div class="hero-slide${active ? ' active' : ''}">
      <img class="hero-img" src="${window.assetUrl(s.image)}" alt="Featured promotion" />
    </div>`;
  }

  function renderHero(slides) {
    const heroEl = document.getElementById('heroSlider');
    const dotsWrap = document.getElementById('heroDots');
    const loading = document.getElementById('heroLoading');
    if (!heroEl) return;
    if (loading) loading.remove();
    // Fall back to the bundled banner images when the admin hasn't uploaded any.
    if (!slides || !slides.length) {
      slides = [
        { id: 'b1', image: 'assets/games/banner1.png' },
        { id: 'b2', image: 'assets/games/banner2.png' },
        { id: 'b3', image: 'assets/games/banner3.png' },
      ];
    }
    heroEl.style.display = '';
    heroEl.querySelectorAll('.hero-slide').forEach(n => n.remove());
    dotsWrap.innerHTML = '';
    slides.forEach((s, i) => dotsWrap.insertAdjacentHTML('beforebegin', heroSlideHTML(s, i === 0)));

    const slideEls = Array.from(heroEl.querySelectorAll('.hero-slide'));
    slides.forEach((_, i) => {
      const b = document.createElement('button');
      if (i === 0) b.classList.add('active');
      b.addEventListener('click', () => go(i));
      dotsWrap.appendChild(b);
    });
    const dots = Array.from(dotsWrap.children);
    let idx = 0;
    function go(i) {
      slideEls[idx].classList.remove('active'); dots[idx].classList.remove('active');
      idx = i;
      slideEls[idx].classList.add('active'); dots[idx].classList.add('active');
    }
    if (slideEls.length > 1) setInterval(() => go((idx + 1) % slideEls.length), 6000);
  }

  if (window.SiteConfig && window.SiteConfig.hero) renderHero(window.SiteConfig.hero);
  else (window.configReady || Promise.resolve()).then(c => renderHero((c && c.hero) || []));
})();
