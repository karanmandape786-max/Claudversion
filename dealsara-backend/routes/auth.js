const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");
const { auth, JWT_SECRET } = require("../middleware/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.is_admin || user.isAdmin || false },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function safeUser(u) {
  const { password, ...rest } = u;
  return {
    id: rest.id,
    name: rest.name,
    email: rest.email,
    avatar: rest.avatar || null,
    bio: rest.bio || "",
    location: rest.location || "",
    phone: rest.phone || "",
    verified: rest.verified || false,
    isAdmin: rest.is_admin || rest.isAdmin || false,
    createdAt: rest.created_at || rest.createdAt,
    followers: rest.followers || 0,
    following: rest.following || 0,
  };
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required" });

    const { rows: existing } = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email.trim()]
    );
    if (existing.length > 0)
      return res.status(409).json({ message: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();

    const { rows } = await pool.query(
      `INSERT INTO users (id, name, email, password, verified, is_admin, created_at)
       VALUES ($1, $2, $3, $4, false, false, NOW())
       RETURNING *`,
      [id, name.trim(), email.toLowerCase().trim(), hashed]
    );

    const user = rows[0];
    res.status(201).json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    console.error("Register error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const { rows } = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email.trim()]
    );
    if (rows.length === 0)
      return res.status(401).json({ message: "Invalid email or password" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password || "");
    if (!valid)
      return res.status(401).json({ message: "Invalid email or password" });

    res.json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    console.error("Login error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// ── GOOGLE LOGIN ──────────────────────────────────────────────────────────────
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: "No credential provided" });

    const parts = credential.split(".");
    if (parts.length !== 3) return res.status(400).json({ message: "Invalid token" });
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const { email, name, sub, picture } = payload;
    if (!email) return res.status(400).json({ message: "Email not in token" });

    let { rows } = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email.toLowerCase()]
    );

    let user;
    if (rows.length === 0) {
      const { rows: newRows } = await pool.query(
        `INSERT INTO users (id, name, email, password, avatar, google_id, verified, is_admin, created_at)
         VALUES ($1, $2, $3, '', $4, $5, true, false, NOW())
         RETURNING *`,
        [uuidv4(), name || email.split("@")[0], email.toLowerCase(), picture || null, sub]
      );
      user = newRows[0];
    } else {
      user = rows[0];
    }

    res.json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    console.error("Google login error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// ── GET ME ────────────────────────────────────────────────────────────────────
router.get("/me", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (rows.length === 0) return res.status(404).json({ message: "User not found" });
    res.json(safeUser(rows[0]));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── UPDATE PROFILE ────────────────────────────────────────────────────────────
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, bio, location, phone, avatar } = req.body;
    const { rows } = await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        bio = COALESCE($2, bio),
        location = COALESCE($3, location),
        phone = COALESCE($4, phone),
        avatar = COALESCE($5, avatar)
       WHERE id = $6 RETURNING *`,
      [name || null, bio || null, location || null, phone || null, avatar || null, req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "User not found" });
    res.json(safeUser(rows[0]));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── SEED ADMIN ────────────────────────────────────────────────────────────────
router.post("/seed-admin", async (req, res) => {
  try {
    const hashed = await bcrypt.hash("Password100@", 10);
    await pool.query(
      `INSERT INTO users (id, name, email, password, verified, is_admin, created_at)
       VALUES ($1, 'Admin', 'karanmandape786@gmail.com', $2, true, true, NOW())
       ON CONFLICT (email) DO UPDATE SET password = $2, is_admin = true`,
      [uuidv4(), hashed]
    );
    res.json({ message: "✅ Admin seeded successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
