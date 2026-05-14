# DealSara Backend v2.0 — Supabase Edition

Express.js REST API backed by Supabase (PostgreSQL).

## 🚀 Deploy to Render in 3 Steps

### Step 1: Set up Supabase
1. Go to your Supabase project: https://lxjyqtoudishyreidryb.supabase.co
2. Open **SQL Editor** → paste the contents of `supabase/migrations/001_full_schema.sql` → **Run**
3. Then run this to set the admin password:
   ```
   POST https://your-render-url.onrender.com/api/auth/seed-admin
   Body: {"secret": "dealsara-seed-2024"}
   ```

### Step 2: Deploy on Render
1. Push this folder to GitHub repo (e.g. `dealsara-backend`)
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect the repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `SUPABASE_URL` | `https://lxjyqtoudishyreidryb.supabase.co` |
   | `SUPABASE_ANON_KEY` | your anon key from Supabase Settings → API |
   | `JWT_SECRET` | any long random string |
   | `FRONTEND_URL` | `https://claudversion.vercel.app` |
   | `NODE_ENV` | `production` |
6. Deploy → copy the Render URL (e.g. `https://dealsara-backend.onrender.com`)

### Step 3: Update Frontend
In `index.html` line 247, set:
```js
const API = "https://your-render-url.onrender.com";
```

## Admin Access
- **Email:** karanmandape786@gmail.com
- **Password:** Password100@
- After deploying, call `POST /api/auth/seed-admin` with `{"secret":"dealsara-seed-2024"}` once to set up the admin account.

## API Routes

| Method | Route | Auth |
|--------|-------|------|
| POST | /api/auth/register | — |
| POST | /api/auth/login | — |
| POST | /api/auth/google | — |
| GET | /api/auth/me | ✅ |
| PUT | /api/auth/profile | ✅ |
| GET | /api/ads | — |
| POST | /api/ads | ✅ |
| GET | /api/ads/saved/me | ✅ |
| GET/PUT/DELETE | /api/ads/:id | — / ✅ |
| POST | /api/ads/:id/like | ✅ |
| POST | /api/ads/:id/save | ✅ |
| GET | /api/reels | — |
| POST | /api/reels | ✅ |
| POST | /api/reels/:id/like | ✅ |
| GET | /api/competition/current | — |
| POST | /api/competition/register | ✅ |
| GET | /api/competition/my-status | ✅ |
| GET | /api/competition/validate-referral/:code | — |
| GET | /api/chat/conversations | ✅ |
| POST | /api/chat/start | ✅ |
| GET | /api/chat/unread | ✅ |
| GET | /api/admin/stats | 🔒 Admin |
| GET | /api/admin/competition/registrations | 🔒 Admin |

## Local Development
```bash
cp .env.example .env
# Fill in your Supabase credentials
npm install
npm run dev
```
