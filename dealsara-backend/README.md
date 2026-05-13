# DealSara Backend API

Express.js REST API for DealSara — classifieds marketplace.

## Quick Deploy to Render

1. Push this folder to a GitHub repo (e.g. `dealsara-backend`)
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect the repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add Environment Variables:
   - `JWT_SECRET` → any long random string
   - `FRONTEND_URL` → your Vercel URL (e.g. `https://dealsara.vercel.app`)
   - `NODE_ENV` → `production`
6. Deploy → copy the Render URL

## Local Development

```bash
cp .env.example .env
# Edit .env with your values
npm install
npm run dev
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | — | Register |
| POST | /api/auth/login | — | Login |
| POST | /api/auth/google | — | Google OAuth |
| GET | /api/auth/me | ✅ | Current user |
| PUT | /api/auth/profile | ✅ | Update profile |
| GET | /api/ads | — | List ads |
| POST | /api/ads | ✅ | Create ad |
| GET | /api/ads/saved/me | ✅ | Saved ads |
| GET | /api/ads/:id | — | Get ad |
| PUT | /api/ads/:id | ✅ | Update ad |
| DELETE | /api/ads/:id | ✅ | Delete ad |
| POST | /api/ads/:id/save | ✅ | Save/unsave |
| POST | /api/ads/:id/like | ✅ | Like/unlike |
| GET | /api/ads/:id/comments | — | Comments |
| POST | /api/ads/:id/comment | ✅ | Add comment |
| GET | /api/reels | — | List reels |
| POST | /api/reels | ✅ | Create reel |
| POST | /api/reels/:id/like | ✅ | Like reel |
| GET | /api/reels/:id/comments | — | Reel comments |
| POST | /api/reels/:id/comment | ✅ | Comment reel |
| GET | /api/chat/conversations | ✅ | My chats |
| POST | /api/chat/start | ✅ | Start chat |
| GET | /api/chat/conversations/:id | ✅ | Chat messages |
| POST | /api/chat/conversations/:id/message | ✅ | Send message |
| GET | /api/chat/unread | ✅ | Unread count |
| GET | /api/users/suggestions | — | User suggestions |
| GET | /api/users/leaderboard | — | Leaderboard |

## Demo Credentials

- **Email:** demo@dealsara.com / **Password:** demo1234
- **Admin:** admin@dealsara.com / **Password:** admin2024

## Notes

- Data is stored in `data.json` (in-memory + file). On Render free tier, data resets on sleep/restart.
- For persistent data, integrate MongoDB Atlas (free tier) or Supabase.
