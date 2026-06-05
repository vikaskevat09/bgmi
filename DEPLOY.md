# Deploy guide — Frontend on Hostinger + Backend on Render (free)

Your project has two parts:
- **Frontend** (HTML/CSS/JS + images) → goes on **Hostinger** (normal shared plan).
- **Backend** (`server/` — Node.js) → goes on **Render** (free Node host).

Follow the steps in order.

---

## PART 1 — Deploy the backend on Render

1. Put this whole project in a **GitHub repo** (private is fine).
2. Go to https://render.com → sign up → **New → Web Service** → connect your repo.
3. Settings:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. Add **Environment Variables** (Render → your service → Environment):

   | Key | Value |
   |-----|-------|
   | `CASHFREE_ENV` | `production` |
   | `CASHFREE_APP_ID` | your Cashfree App ID |
   | `CASHFREE_SECRET_KEY` | your Cashfree secret key |
   | `CASHFREE_API_VERSION` | `2023-08-01` |
   | `SESSION_SECRET` | a long random string |
   | `ADMIN_PASSWORD` | a strong admin password |
   | `COOKIE_CROSS_SITE` | `true` |
   | `CORS_ORIGIN` | `https://yourdomain.com,https://www.yourdomain.com` |
   | `RETURN_URL` | `https://yourdomain.com/return.html` |
   | `NOTIFY_URL` | `https://YOUR-BACKEND.onrender.com/api/webhook` |
   | `RAPIDAPI_KEY` / `RAPIDAPI_HOST` / `RAPIDAPI_URL_TEMPLATE` | your ID-verification API (optional) |

5. Click **Deploy**. When it's live you'll get a URL like:
   `https://topupworld-api.onrender.com`
6. Test it: open `https://topupworld-api.onrender.com/api/config` — you should see JSON.

> Tip: the `NOTIFY_URL` uses the Render URL (you only know it after the first deploy).
> Deploy once, copy the URL, paste it into `NOTIFY_URL`, and redeploy.

---

## PART 2 — Point the frontend at the backend

1. Open `js/config.js` and set your Render URL:

   ```js
   window.TUZ_API_BASE = "https://topupworld-api.onrender.com";
   ```
   (no trailing slash)

2. Save. That's the only code change needed on the frontend.

---

## PART 3 — Upload the frontend to Hostinger

Upload **everything EXCEPT the `server/` folder** to Hostinger's `public_html`:

Upload these:
- `index.html`, `game.html`, `cart.html`, `checkout.html`, `account.html`,
  `return.html`, `admin.html`, `terms.html`, `privacy.html`, `refund.html`, `about.html`
- `styles.css`, `admin.css`
- the `js/` folder
- the `assets/` folder

Do NOT upload: `server/`, `node_modules/`, `.env`, `DEPLOY.md`, `README.md`.

Steps in Hostinger:
1. hPanel → **File Manager** → open `public_html`.
2. Upload the files/folders above (or zip them, upload, then Extract).
3. Enable **free SSL** (hPanel → SSL) so the site is `https://`.

Open `https://yourdomain.com` — the store loads. `https://yourdomain.com/admin.html`
is your admin (password = `ADMIN_PASSWORD` you set on Render).

---

## PART 4 — Cashfree dashboard

In the Cashfree dashboard, whitelist your domains and set the webhook:
- **Webhook URL:** `https://YOUR-BACKEND.onrender.com/api/webhook`
- **Return/Allowed domains:** `https://yourdomain.com`

---

## Important notes / limitations

- **Render free tier sleeps** after ~15 min idle; the first request then takes
  ~30–50s to wake. Fine for low traffic; upgrade to keep it always-on.
- **Render free filesystem is temporary.** Admin-uploaded logos, hero banners,
  currency icons, and the `server/data` (accounts + orders) are **wiped on each
  redeploy/restart.** For permanent storage either:
  - attach a **Render Persistent Disk** (paid), mounted so `assets/` + `data/` survive, or
  - use external storage (Cloudinary/S3) + a database (e.g. free Postgres).
  For going live properly, plan for one of these.
- Uploaded images are served FROM the backend; the frontend references them via
  `TUZ_API_BASE` automatically (already wired in `js/ui.js`).
- Always keep real secrets only in Render's Environment tab — never commit `.env`.

---

## Quick local test before deploying
```
cd server
npm install
copy .env.example .env   # fill values; keep COOKIE_CROSS_SITE empty for localhost
npm start
```
Open http://localhost:8080 (here `TUZ_API_BASE` stays `""` so frontend+backend
share one origin).
