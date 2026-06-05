# TopUpZone

An original game top-up storefront (white / black / orange theme) with a real
cart, checkout, **Cashfree** payments, and **RapidAPI ID verification**.

> Branding, game names, and cover art are placeholders. Replace them with names
> and artwork you are licensed to use before going live. Not affiliated with any
> game publisher or payment brand.

## Structure

```
index.html          Home (hero, games grid, vouchers)
game.html           Game detail: enter Player ID, verify, pick amount
cart.html           Cart with qty controls + totals
checkout.html       Contact details + Cashfree payment
return.html         Post-payment status (polls order status)
styles.css          Theme + all components
js/
  catalog.js        Game catalog (single source of truth, client)
  cart.js           localStorage cart
  ui.js             Shared header/cart-badge/toast helpers
  home.js           Home page logic
  game.js           Game detail + ID verification UI
  cart-page.js      Cart page logic
  checkout.js       Checkout + Cashfree SDK
assets/games/*.svg  Placeholder cover art (swap with licensed art, same names)
tools/gen-assets.js Regenerates placeholder covers
server/             Node/Express backend
  server.js         Order creation, webhook, ID-verify proxy, fulfillment stub
  catalog.js        Server-side price book (authoritative) + verify slug map
  .env.example      Copy to .env and fill in your keys
```

## Run it

```bash
cd server
npm install
copy .env.example .env   # then edit .env with your keys (Windows: copy / *nix: cp)
npm start
```

Open http://localhost:8080 (the backend serves the site too, so the API and
pages share one origin — no CORS headaches).

## Cashfree payments

1. Create a Cashfree account → Dashboard → Developers → **API Keys**.
2. Put the App ID + Secret in `server/.env` and set `CASHFREE_ENV=sandbox`
   while testing (switch to `production` with live keys when ready).
3. Flow: browser → `POST /api/create-order` → backend creates the order with
   Cashfree and returns `payment_session_id` → Cashfree JS SDK opens checkout →
   on completion Cashfree redirects to `return.html` and posts a signed webhook
   to `POST /api/webhook`.
4. **Price safety:** the browser only sends SKUs + quantities. The server
   recomputes the amount from `server/catalog.js`, so a tampered client can
   never change what's charged.
5. `fulfill()` in `server.js` is where you call the publisher/reseller delivery
   API after a confirmed `SUCCESS` webhook. It's idempotent.

## ID verification (RapidAPI)

The key lives **only** in `server/.env` and is proxied via
`GET /api/verify-id?game=<id>&id=<playerId>[&server=<server>]`. Never put the
RapidAPI key in client code.

Normalized response:

```json
{ "ok": true, "verified": true, "username": "SoyBlaze", "id": "..." }
```

Provider notes (id-game-checker):
- Single segment: `/{slug}/{id}` (e.g. `free-fire`, `arena-of-valor`)
- Server segment: `/{slug}/{id}/{server}` (e.g. `mobile-legends`) — the UI
  sends the Server field automatically for games flagged in `VERIFY_NEEDS_SERVER`.
- Slug mapping lives in `server/catalog.js` → `VERIFY_SLUGS`. Adjust slugs to
  match the exact games/provider you subscribe to.
- If no key is configured, the endpoint falls back to format-only validation so
  the UI still works in development.

## Swapping in licensed artwork

Replace `assets/games/<id>.svg` with your licensed image (same filename; `.png`
/ `.jpg` also fine if you update `cover()` in `js/catalog.js`). Everything else
updates automatically.

## Security checklist before going live
- [ ] Regenerate the RapidAPI key if it was ever shared in plain text.
- [ ] Move orders from the in-memory `Map` to a real database.
- [ ] Use HTTPS + your real domain in `RETURN_URL` / `NOTIFY_URL`.
- [ ] Lock `CORS_ORIGIN` to your domain (not `*`).
- [ ] Add auth/rate-limiting to `/api/verify-id` to protect your API quota.
- [ ] Confirm webhook signature verification with live Cashfree keys.
```
