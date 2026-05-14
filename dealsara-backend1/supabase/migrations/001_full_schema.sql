-- ================================================================
-- DealSara Full Schema — Run this in Supabase SQL Editor
-- ================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL DEFAULT '',
  avatar      TEXT,
  bio         TEXT DEFAULT '',
  location    TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  verified    BOOLEAN DEFAULT false,
  is_admin    BOOLEAN DEFAULT false,
  google_id   TEXT,
  followers   INT DEFAULT 0,
  following   INT DEFAULT 0,
  rating      DECIMAL(3,2) DEFAULT 0,
  total_sales INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ADS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ads (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  price       DECIMAL(12,2) NOT NULL DEFAULT 0,
  category    TEXT DEFAULT 'Other',
  condition   TEXT DEFAULT 'Good',
  location    TEXT DEFAULT '',
  images      TEXT[] DEFAULT '{}',
  video_url   TEXT,
  is_featured BOOLEAN DEFAULT false,
  is_promoted BOOLEAN DEFAULT false,
  views       INT DEFAULT 0,
  likes       INT DEFAULT 0,
  saves       INT DEFAULT 0,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── REELS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reels (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  caption       TEXT DEFAULT '',
  description   TEXT DEFAULT '',
  video_url     TEXT,
  thumbnail     TEXT,
  ad_id         UUID REFERENCES ads(id) ON DELETE SET NULL,
  competition_id TEXT,
  is_competition BOOLEAN DEFAULT false,
  likes         INT DEFAULT 0,
  views         INT DEFAULT 0,
  comments      INT DEFAULT 0,
  shares        INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── COMPETITIONS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  description     TEXT,
  prize           TEXT DEFAULT '₹5,000',
  entry_fee       INT DEFAULT 39,
  discounted_fee  INT DEFAULT 34,
  reg_opens       DATE,
  reg_closes      DATE,
  starts_at       DATE,
  results_at      DATE,
  status          TEXT DEFAULT 'upcoming',  -- upcoming | active | ended
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── COMPETITION REGISTRATIONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS competition_registrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competition_id  UUID REFERENCES competitions(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  real_name       TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  referral_code   TEXT,
  payment_status  TEXT DEFAULT 'pending',  -- pending | paid
  amount_paid     INT DEFAULT 0,
  registered_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, user_id)
);

-- ── CONVERSATIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant1_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  participant2_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  ad_id            UUID REFERENCES ads(id) ON DELETE SET NULL,
  last_message     TEXT,
  last_message_at  TIMESTAMPTZ,
  unread1          INT DEFAULT 0,
  unread2          INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── MESSAGES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SAVED ADS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_ads (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  ad_id     UUID REFERENCES ads(id) ON DELETE CASCADE,
  saved_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, ad_id)
);

-- ── AD LIKES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_likes (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  ad_id     UUID REFERENCES ads(id) ON DELETE CASCADE,
  liked_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, ad_id)
);

-- ── AD COMMENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_id      UUID REFERENCES ads(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── REEL LIKES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_likes (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  reel_id   UUID REFERENCES reels(id) ON DELETE CASCADE,
  liked_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, reel_id)
);

-- ── REEL COMMENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reel_id    UUID REFERENCES reels(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── SEED: Initial Competition ──────────────────────────────────────
INSERT INTO competitions (name, description, prize, entry_fee, discounted_fee, reg_opens, reg_closes, starts_at, results_at, status)
VALUES (
  'BADHEGA INDIA REEL COMPETITION',
  'Upload your best reels during the competition period. Views(1pt) + Likes(2pts) = Final Score. Winner gets ₹5,000!',
  '₹5,000',
  39, 34,
  '2025-05-15',
  '2025-08-15',
  '2025-08-15',
  '2025-09-15',
  'active'
) ON CONFLICT DO NOTHING;

-- ── SEED: Admin User ───────────────────────────────────────────────
-- Password: Password100@ (bcrypt hash)
-- Run this only once; change the hash if you change the password
INSERT INTO users (name, email, password, verified, is_admin)
VALUES (
  'Admin',
  'karanmandape786@gmail.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  true,
  true
) ON CONFLICT (email) DO UPDATE SET is_admin = true;
-- NOTE: The hash above is a placeholder. After deploying, call POST /api/auth/seed-admin
-- to set the real bcrypt hash for Password100@

-- ── INDEXES for performance ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ads_user_id    ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_status     ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_created    ON ads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_user_id  ON reels(user_id);
CREATE INDEX IF NOT EXISTS idx_reels_created  ON reels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msgs_conv_id   ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_comp_reg_comp  ON competition_registrations(competition_id);
CREATE INDEX IF NOT EXISTS idx_reel_comp      ON reels(is_competition);
