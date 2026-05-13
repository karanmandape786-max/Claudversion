const router = require("express").Router();
const { db, saveData } = require("../db");
const { auth, adminAuth } = require("../middleware/auth");

// POST /api/admin/login
router.post("/login", (req, res) => {
  const { code } = req.body;
  if (code !== db.adminCode && code !== process.env.ADMIN_CODE) {
    return res.status(401).json({ message: "Invalid admin code" });
  }
  res.json({ ok: true, message: "Admin access granted" });
});

// GET /api/admin/stats
router.get("/stats", adminAuth, (req, res) => {
  res.json({
    totalUsers: db.users.filter((u) => !u.isAdmin).length,
    totalAds: db.ads.length,
    activeAds: db.ads.filter((a) => a.status === "active").length,
    totalReels: db.reels.length,
    totalConversations: db.conversations.length,
    totalMessages: db.messages.length,
  });
});

// GET /api/admin/users
router.get("/users", adminAuth, (req, res) => {
  const users = db.users.map(({ password, ...u }) => u);
  res.json({ users });
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", adminAuth, (req, res) => {
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "User not found" });
  db.users.splice(idx, 1);
  saveData();
  res.json({ message: "User deleted" });
});

// GET /api/admin/ads
router.get("/ads", adminAuth, (req, res) => {
  res.json({ ads: db.ads });
});

// DELETE /api/admin/ads/:id
router.delete("/ads/:id", adminAuth, (req, res) => {
  const idx = db.ads.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Ad not found" });
  db.ads.splice(idx, 1);
  saveData();
  res.json({ message: "Ad deleted" });
});

// PUT /api/admin/ads/:id/feature
router.put("/ads/:id/feature", adminAuth, (req, res) => {
  const ad = db.ads.find((a) => a.id === req.params.id);
  if (!ad) return res.status(404).json({ message: "Ad not found" });
  ad.isFeatured = !ad.isFeatured;
  saveData();
  res.json({ ad });
});

module.exports = router;
