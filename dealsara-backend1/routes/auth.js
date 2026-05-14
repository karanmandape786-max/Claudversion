const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");
const { auth, JWT_SECRET } = require("../middleware/auth");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.is_admin || false },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function safeUser(u) {
  const { password, ...rest } = u;
  return rest;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required" });

    // Check existing
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .ilike("email", email.trim())
      .single();

    if (existing) return res.status(409).json({ message: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase
      .from("users")
      .insert({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashed,
        verified: false,
        is_admin: false,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email.trim())
      .single();

    if (error || !user) return res.status(401).json({ message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password || "");
    if (!valid) return res.status(401).json({ message: "Invalid email or password" });

    res.json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: "No credential provided" });

    const parts = credential.split(".");
    if (parts.length !== 3) return res.status(400).json({ message: "Invalid token" });
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const { email, name, sub, picture } = payload;
    if (!email) return res.status(400).json({ message: "Email not in token" });

    // Find or create user
    let { data: user } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email.toLowerCase())
      .single();

    if (!user) {
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({
          name: name || email.split("@")[0],
          email: email.toLowerCase(),
          password: "",
          avatar: picture || null,
          google_id: sub,
          verified: true,
          is_admin: false,
        })
        .select()
        .single();
      if (error) throw error;
      user = newUser;
    }

    res.json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/auth/me
router.get("/me", auth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.userId)
      .single();
    if (error || !user) return res.status(404).json({ message: "User not found" });
    res.json(safeUser(user));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/auth/profile
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, bio, location, phone, avatar } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (bio !== undefined) updates.bio = bio;
    if (location !== undefined) updates.location = location;
    if (phone !== undefined) updates.phone = phone;
    if (avatar !== undefined) updates.avatar = avatar;

    const { data: user, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(safeUser(user));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/auth/seed-admin — sets admin password correctly (call once after deploy)
router.post("/seed-admin", async (req, res) => {
  try {
    const { secret } = req.body;
    if (secret !== process.env.SEED_SECRET && secret !== "dealsara-seed-2024")
      return res.status(403).json({ message: "Forbidden" });

    const hashed = await bcrypt.hash("Password100@", 10);
    const { data, error } = await supabase
      .from("users")
      .upsert({
        name: "Admin",
        email: "karanmandape786@gmail.com",
        password: hashed,
        verified: true,
        is_admin: true,
      }, { onConflict: "email" })
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Admin seeded", id: data.id });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
