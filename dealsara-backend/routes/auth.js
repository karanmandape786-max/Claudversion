const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { db, saveData } = require("../db");
const { auth, JWT_SECRET } = require("../middleware/auth");

function safeUser(u) {
  const { password, ...rest } = u;
  return rest;
}

function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required" });

    if (db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(409).json({ message: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      avatar: null,
      bio: "",
      location: "",
      phone: "",
      verified: false,
      isAdmin: false,
      createdAt: new Date().toISOString(),
      followers: 0,
      following: 0,
      rating: 0,
      totalSales: 0,
    };
    db.users.push(user);
    saveData();

    res.status(201).json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.users.find((u) => u.email.toLowerCase() === email?.toLowerCase());
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Invalid email or password" });

    res.json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/auth/google  (mock — real needs google-auth-library)
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: "No credential provided" });

    // Decode payload (without verifying — add google-auth-library for production)
    const parts = credential.split(".");
    if (parts.length !== 3) return res.status(400).json({ message: "Invalid JWT" });
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    const { email, name, sub, picture } = payload;
    if (!email) return res.status(400).json({ message: "Email not found in token" });

    let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      user = {
        id: uuidv4(),
        name: name || email.split("@")[0],
        email: email.toLowerCase(),
        password: "",
        avatar: picture || null,
        googleId: sub,
        bio: "",
        location: "",
        phone: "",
        verified: true,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        followers: 0,
        following: 0,
        rating: 0,
        totalSales: 0,
      };
      db.users.push(user);
      saveData();
    }

    res.json({ user: safeUser(user), token: makeToken(user) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/auth/me
router.get("/me", auth, (req, res) => {
  res.json(safeUser(req.user));
});

// PUT /api/auth/profile
router.put("/profile", auth, (req, res) => {
  try {
    const { name, bio, location, phone, avatar } = req.body;
    const idx = db.users.findIndex((u) => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ message: "User not found" });

    if (name !== undefined) db.users[idx].name = name.trim();
    if (bio !== undefined) db.users[idx].bio = bio;
    if (location !== undefined) db.users[idx].location = location;
    if (phone !== undefined) db.users[idx].phone = phone;
    if (avatar !== undefined) db.users[idx].avatar = avatar;

    saveData();
    const { password, ...rest } = db.users[idx];
    res.json(rest);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
