const router = require("express").Router();
const { db, saveData } = require("../db");
const { auth, optionalAuth } = require("../middleware/auth");

function safeUser(u) {
  const { password, ...rest } = u;
  return rest;
}

// GET /api/users/suggestions
router.get("/suggestions", optionalAuth, (req, res) => {
  const myId = req.user?.id;
  const suggestions = db.users
    .filter((u) => u.id !== myId && !u.isAdmin)
    .slice(0, 5)
    .map(safeUser);
  res.json({ users: suggestions });
});

// GET /api/users/leaderboard
router.get("/leaderboard", (req, res) => {
  const leaders = db.users
    .filter((u) => !u.isAdmin)
    .map((u) => {
      const adCount = db.ads.filter((a) => a.userId === u.id).length;
      const totalLikes = db.ads
        .filter((a) => a.userId === u.id)
        .reduce((sum, a) => sum + (a.likes || 0), 0);
      return { ...safeUser(u), adCount, totalLikes, score: adCount * 10 + totalLikes };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  res.json({ leaderboard: leaders });
});

// GET /api/users/:id
router.get("/:id", optionalAuth, (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  const adCount = db.ads.filter((a) => a.userId === user.id && a.status === "active").length;
  res.json({ ...safeUser(user), adCount });
});

// GET /api/users/:id/ads
router.get("/:id/ads", optionalAuth, (req, res) => {
  const ads = db.ads.filter((a) => a.userId === req.params.id && a.status === "active");
  res.json({ ads });
});

module.exports = router;
