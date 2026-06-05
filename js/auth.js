/**
 * Client-side auth helper. Talks to the backend session API.
 * The session lives in an httpOnly cookie (set by the server), so this module
 * never touches the token directly — it just calls the endpoints.
 */
window.Auth = (function () {
  const API = window.TUZ_API_BASE || '';
  let cachedUser = undefined; // undefined = not loaded yet, null = logged out

  async function me(force) {
    if (cachedUser !== undefined && !force) return cachedUser;
    try {
      const r = await fetch(API + '/api/auth/me', { credentials: 'include' });
      const d = await r.json();
      cachedUser = d.user || null;
    } catch { cachedUser = null; }
    document.dispatchEvent(new CustomEvent('auth:change', { detail: { user: cachedUser } }));
    return cachedUser;
  }

  async function signup(name, email, password) {
    const r = await fetch(API + '/api/auth/signup', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Sign up failed.');
    cachedUser = d.user;
    document.dispatchEvent(new CustomEvent('auth:change', { detail: { user: cachedUser } }));
    return cachedUser;
  }

  async function login(email, password) {
    const r = await fetch(API + '/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Sign in failed.');
    cachedUser = d.user;
    document.dispatchEvent(new CustomEvent('auth:change', { detail: { user: cachedUser } }));
    return cachedUser;
  }

  async function logout() {
    try { await fetch(API + '/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    cachedUser = null;
    document.dispatchEvent(new CustomEvent('auth:change', { detail: { user: null } }));
  }

  // Saved IDs
  async function saveId(entry) {
    const r = await fetch(API + '/api/saved-ids', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!r.ok) return null;
    return (await r.json()).savedIds;
  }
  async function getSavedIds() {
    const r = await fetch(API + '/api/saved-ids', { credentials: 'include' });
    if (!r.ok) return [];
    return (await r.json()).savedIds || [];
  }
  async function removeSavedId(index) {
    const r = await fetch(API + '/api/saved-ids/' + index, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) return [];
    return (await r.json()).savedIds || [];
  }
  async function myOrders() {
    const r = await fetch(API + '/api/my-orders', { credentials: 'include' });
    if (!r.ok) return [];
    return (await r.json()).orders || [];
  }

  return { me, signup, login, logout, saveId, getSavedIds, removeSavedId, myOrders, get user() { return cachedUser; } };
})();

/* ----- Shared auth modal (injected on any page that includes this script) ----- */
(function () {
  function injectModal() {
    if (document.getElementById('authModal')) return;
    const el = document.createElement('div');
    el.className = 'modal';
    el.id = 'authModal';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="modal-backdrop" data-aclose></div>
      <div class="login-card" role="dialog" aria-modal="true">
        <button class="modal-close" data-aclose aria-label="Close">×</button>
        <div class="login-head">
          <span class="brand-mark"><svg viewBox="0 0 40 40" width="38" height="38" fill="none">
            <defs><linearGradient id="lgm" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff5a00"/></linearGradient></defs>
            <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#lgm)"/>
            <path d="M22.5 8 12 22.5h6.4L16 32l11.2-15.4H20L22.5 8z" fill="#fff"/></svg></span>
          <h2 id="authTitle">Sign in to TopUpWorld</h2>
          <p id="authSub">Save your IDs and track your orders.</p>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab is-active" data-tab="login">Sign in</button>
          <button class="auth-tab" data-tab="signup">Create account</button>
        </div>
        <div class="field" id="nameField" style="display:none">
          <label for="authName">Full name</label>
          <input id="authName" type="text" placeholder="Your name" autocomplete="name" />
        </div>
        <div class="field"><label for="authEmail">Email</label>
          <input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email" /></div>
        <div class="field"><label for="authPass">Password</label>
          <input id="authPass" type="password" placeholder="At least 8 characters" autocomplete="current-password" /></div>
        <button class="btn btn-primary btn-block btn-lg" id="authSubmit" style="margin-top:.9rem">Sign in</button>
        <p class="login-note">🔒 Your password is encrypted (scrypt-hashed) and never stored in readable form. We never ask for your game password.</p>
      </div>`;
    document.body.appendChild(el);
    wire(el);
  }

  function wire(el) {
    let mode = 'login';
    const close = () => { el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
    el.querySelectorAll('[data-aclose]').forEach(x => x.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    const nameField = el.querySelector('#nameField');
    const submit = el.querySelector('#authSubmit');
    const title = el.querySelector('#authTitle');
    const sub = el.querySelector('#authSub');

    el.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
      el.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      mode = tab.dataset.tab;
      nameField.style.display = mode === 'signup' ? 'block' : 'none';
      submit.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
      title.textContent = mode === 'signup' ? 'Create your account' : 'Sign in to TopUpWorld';
      sub.textContent = mode === 'signup' ? 'It takes a few seconds.' : 'Save your IDs and track your orders.';
    }));

    submit.addEventListener('click', async () => {
      const name = el.querySelector('#authName').value.trim();
      const email = el.querySelector('#authEmail').value.trim();
      const pass = el.querySelector('#authPass').value;
      submit.disabled = true;
      const original = submit.textContent;
      submit.textContent = 'Please wait…';
      try {
        if (mode === 'signup') await window.Auth.signup(name, email, pass);
        else await window.Auth.login(email, pass);
        window.toast('✅ Welcome, ' + (window.Auth.user.name || 'gamer') + '!', 'ok');
        close();
        if (window.onAuthSuccess) window.onAuthSuccess(window.Auth.user);
      } catch (e) {
        window.toast('⚠️ ' + e.message, 'err');
      } finally {
        submit.disabled = false;
        submit.textContent = original;
      }
    });
  }

  window.openAuth = function (mode) {
    injectModal();
    const el = document.getElementById('authModal');
    if (mode === 'signup') { const t = el.querySelector('[data-tab="signup"]'); if (t) t.click(); }
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  document.addEventListener('DOMContentLoaded', () => { window.Auth.me(); });
})();
