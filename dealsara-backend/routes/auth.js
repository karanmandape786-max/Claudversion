const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { db, saveData, supabase, useSupabase } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dealsara-super-secret-key-2024";

// Middleware to get user from token
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access token required" });
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" });
    req.userId = decoded.id;
    next();
  });
};

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.isAdmin || user.is_admin || false },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function safeUser(u) {
  const { password, ...rest } = u;
  return rest;
}

// ──────────────────────────────────────────────────────────────────────────────
// REGISTER
// ──────────────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    // Check if user exists
    let existingUser = null;
    
    if (useSupabase && supabase) {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .ilike("email", email.trim())
        .single();
      existingUser = existing;
    } else {
      existingUser = db.users.find(u => u.email === email);
    }

    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
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

    let savedUser = newUser;

    if (useSupabase && supabase) {
      const { data: user, error } = await supabase
        .from("users")
        .insert({
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          password: hashed,
          verified: false,
          is_admin: false,
          created_at: newUser.createdAt,
        })
        .select()
        .single();
      
      if (error) throw error;
      savedUser = { ...newUser, ...user };
    } else {
      db.users.push(newUser);
      saveData();
    }

    res.status(201).json({ user: safeUser(savedUser), token: makeToken(savedUser) });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ message: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    let user = null;

    if (useSupabase && supabase) {
      const { data: userData, error } = await supabase
        .from("users")
        .select("*")
        .ilike("email", email.trim())
        .single();
      
      if (error || !userData) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      user = userData;
    } else {
      user = db.users.find(u => u.email === email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
    }

    const valid = await bcrypt.compare(password, user.password || "");
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Convert field names for consistency
    const responseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      location: user.location,
      phone: user.phone,
      verified: user.verified || false,
      isAdmin: user.isAdmin || user.is_admin || false,
      createdAt: user.createdAt || user.created_at,
    };

    res.json({ user: responseUser, token: makeToken(responseUser) });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ message: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GOOGLE LOGIN
// ──────────────────────────────────────────────────────────────────────────────
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: "No credential provided" });

    const parts = credential.split(".");
    if (parts.length !== 3) return res.status(400).json({ message: "Invalid token" });
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const { email, name, sub, picture } = payload;
    if (!email) return res.status(400).json({ message: "Email not in token" });

    let user = null;

    if (useSupabase && supabase) {
      let { data: existingUser } = await supabase
        .from("users")
        .select("*")
        .ilike("email", email.toLowerCase())
        .single();

      if (!existingUser) {
        const { data: newUser, error } = await supabase
          .from("users")
          .insert({
            id: uuidv4(),
            name: name || email.split("@")[0],
            email: email.toLowerCase(),
            password: "",
            avatar: picture || null,
            google_id: sub,
            verified: true,
            is_admin: false,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        user = newUser;
      } else {
        user = existingUser;
      }
    } else {
      let existingUser = db.users.find(u => u.email === email);
      if (!existingUser) {
        const newUser = {
          id: uuidv4(),
          name: name || email.split("@")[0],
          email: email.toLowerCase(),
          password: "",
          avatar: picture || null,
          google_id: sub,
          verified: true,
          isAdmin: false,
          createdAt: new Date().toISOString(),
          followers: 0,
          following: 0,
          rating: 0,
          totalSales: 0,
        };
        db.users.push(newUser);
        saveData();
        user = newUser;
      } else {
        user = existingUser;
      }
    }

    const responseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      verified: user.verified || true,
      isAdmin: user.isAdmin || user.is_admin || false,
    };

    res.json({ user: responseUser, token: makeToken(responseUser) });
  } catch (e) {
    console.error("Google login error:", e);
    res.status(500).json({ message: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET CURRENT USER (ME)
// ──────────────────────────────────────────────────────────────────────────────
router.get("/me", auth, async (req, res) => {
  try {
    let user = null;

    if (useSupabase && supabase) {
      const { data: userData, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", req.userId)
        .single();
      
      if (error || !userData) {
        return res.status(404).json({ message: "User not found" });
      }
      user = userData;
    } else {
      user = db.users.find(u => u.id === req.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    const responseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      location: user.location,
      phone: user.phone,
      verified: user.verified || false,
      isAdmin: user.isAdmin || user.is_admin || false,
      createdAt: user.createdAt || user.created_at,
      followers: user.followers || 0,
      following: user.following || 0,
      rating: user.rating || 0,
      totalSales: user.totalSales || 0,
    };

    res.json(responseUser);
  } catch (e) {
    console.error("Get me error:", e);
    res.status(500).json({ message: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE PROFILE
// ──────────────────────────────────────────────────────────────────────────────
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, bio, location, phone, avatar } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (bio !== undefined) updates.bio = bio;
    if (location !== undefined) updates.location = location;
    if (phone !== undefined) updates.phone = phone;
    if (avatar !== undefined) updates.avatar = avatar;

    let updatedUser = null;

    if (useSupabase && supabase) {
      const { data: user, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", req.userId)
        .select()
        .single();

      if (error) throw error;
      updatedUser = user;
    } else {
      const index = db.users.findIndex(u => u.id === req.userId);
      if (index === -1) return res.status(404).json({ message: "User not found" });
      
      db.users[index] = { ...db.users[index], ...updates };
      saveData();
      updatedUser = db.users[index];
    }

    const responseUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      avatar: updatedUser.avatar,
      bio: updatedUser.bio,
      location: updatedUser.location,
      phone: updatedUser.phone,
      verified: updatedUser.verified || false,
      isAdmin: updatedUser.isAdmin || updatedUser.is_admin || false,
    };

    res.json(responseUser);
  } catch (e) {
    console.error("Profile update error:", e);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
