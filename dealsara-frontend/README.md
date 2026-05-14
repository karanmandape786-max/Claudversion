# DealSara Frontend

Static HTML + React (CDN) app. Deploy on Vercel instantly.

## ⚡ Quick Deploy

### Step 1: Update your backend URL
Open `index.html`, find line ~247:
```js
const API = "https://claudversion.onrender.com";
```
Change `https://claudversion.onrender.com` to your actual Render backend URL.

### Step 2: Push to GitHub
```bash
git add .
git commit -m "update API url"
git push
```

### Step 3: Vercel auto-deploys
Vercel picks up the push automatically. Done! ✅

## Features Fixed in This Version
- ✅ DealSara Tesla-inspired logo (no X logo)
- ✅ Admin panel only visible to karanmandape786@gmail.com
- ✅ Admin shows real-time Supabase data
- ✅ Competition page fetches live leaderboard from Supabase
- ✅ Leaderboard shows "competition not live yet" when upcoming
- ✅ Final results shown when competition ends
- ✅ Competition registration calls real API
- ✅ Reels autoplay on scroll, tap to open fullscreen
- ✅ Competition reels tagged in feed
- ✅ All API field names fixed for Supabase
- ✅ Post Ad / Post Reel submits to real backend
- ✅ Referral code validated via API
