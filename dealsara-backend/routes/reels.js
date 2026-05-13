const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const { db, saveData } = require("../db");
const { auth, optionalAuth } = require("../middleware/auth");

function enrichReel(r) {
  const user = db.users.find((u) => u.id === r.userId);
  return {
    ...r,
    user: user
      ? { id: user.id, name: user.name, avatar: user.avatar, verified: user.verified }
      : r.user || null,
  };
}

// GET /api/reels
router.get("/", optionalAuth, (req, res) => {
  let reels = [...db.reels];
  const { userId, limit, offset } = req.query;
  if (userId) reels = reels.filter((r) => r.userId === userId);
  reels.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const lim = Number(limit) || 20;
  const off = Number(offset) || 0;
  const total = reels.length;
  reels = reels.slice(off, off + lim);

  res.json({ reels: reels.map(enrichReel), total, limit: lim, offset: off });
});

// GET /api/reels/:id
router.get("/:id", optionalAuth, (req, res) => {
  const reel = db.reels.find((r) => r.id === req.params.id);
  if (!reel) return res.status(404).json({ message: "Reel not found" });
  reel.views = (reel.views || 0) + 1;
  saveData();
  res.json(enrichReel(reel));
});

// POST /api/reels
router.post("/", auth, (req, res) => {
  const { title, description, videoUrl, thumbnail, adId } = req.body;
  const reel = {
    id: uuidv4(),
    userId: req.user.id,
    title: title || "",
    description: description || "",
    videoUrl: videoUrl || null,
    thumbnail: thumbnail || null,
    adId: adId || null,
    likes: 0,
    views: 0,
    comments: 0,
    createdAt: new Date().toISOString(),
  };
  db.reels.unshift(reel);
  saveData();
  res.status(201).json(enrichReel(reel));
});

// POST /api/reels/:id/like (toggle)
router.post("/:id/like", auth, (req, res) => {
  const reelId = req.params.id;
  const userId = req.user.id;
  const idx = db.reelLikes.findIndex((l) => l.userId === userId && l.reelId === reelId);
  const reel = db.reels.find((r) => r.id === reelId);
  if (idx === -1) {
    db.reelLikes.push({ userId, reelId });
    if (reel) reel.likes = (reel.likes || 0) + 1;
    saveData();
    return res.json({ liked: true, likes: reel?.likes });
  } else {
    db.reelLikes.splice(idx, 1);
    if (reel && reel.likes > 0) reel.likes--;
    saveData();
    return res.json({ liked: false, likes: reel?.likes });
  }
});

// GET /api/reels/:id/comments
router.get("/:id/comments", optionalAuth, (req, res) => {
  const comments = db.reelComments
    .filter((c) => c.reelId === req.params.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((c) => {
      const user = db.users.find((u) => u.id === c.userId);
      return { ...c, user: user ? { id: user.id, name: user.name, avatar: user.avatar } : null };
    });
  res.json({ comments });
});

// POST /api/reels/:id/comment
router.post("/:id/comment", auth, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });
  const comment = {
    id: uuidv4(),
    reelId: req.params.id,
    userId: req.user.id,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  db.reelComments.push(comment);
  const reel = db.reels.find((r) => r.id === req.params.id);
  if (reel) reel.comments = (reel.comments || 0) + 1;
  saveData();
  const user = req.user;
  res.status(201).json({ ...comment, user: { id: user.id, name: user.name, avatar: user.avatar } });
});

// DELETE /api/reels/:id
router.delete("/:id", auth, (req, res) => {
  const idx = db.reels.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Reel not found" });
  if (db.reels[idx].userId !== req.user.id && !req.user.isAdmin)
    return res.status(403).json({ message: "Not authorized" });
  db.reels.splice(idx, 1);
  saveData();
  res.json({ message: "Deleted" });
});

module.exports = router;
