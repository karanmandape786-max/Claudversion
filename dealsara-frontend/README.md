# DealSara Frontend

Single-file React app (HTML + Babel + React CDN). Deploy instantly on Vercel.

## 🚀 Deploy to Vercel (2 minutes)

### Step 1 — Update Backend URL
Open `index.html` and find this line near the top of the `<script>` tag:

```js
const API = "YOUR_RENDER_BACKEND_URL";
```

Replace with your Render backend URL, e.g.:
```js
const API = "https://dealsara-backend.onrender.com";
```

### Step 2 — Push to GitHub
```bash
git init
git add .
git commit -m "DealSara frontend"
git remote add origin https://github.com/YOUR_USERNAME/dealsara-frontend.git
git push -u origin main
```

### Step 3 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Framework: **Other** (no framework)
4. Root Directory: `/` (default)
5. Click **Deploy** ✅

Vercel auto-detects `index.html` and serves it as a static site.

## Local Testing

Just open `index.html` in your browser — no build step needed!
Or use Live Server (VS Code extension) for auto-reload.
