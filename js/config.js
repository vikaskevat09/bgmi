/* ============================================================
   FRONTEND → BACKEND connection
   ------------------------------------------------------------
   Auto-detects where it's running:
   - On localhost  → "" (same-origin local Node server)
   - Anywhere else → the production backend URL below
   So you never need to switch this by hand.
   ============================================================ */
(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  window.TUZ_API_BASE = isLocal ? '' : 'https://topupworld.shop';
})();
