const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const { db, saveData } = require("../db");
const { auth, optionalAuth } = require("../middleware/auth");

function enrichAd(ad) {
  const user = db.users.find((u) => u.id === ad.userId);
  return {
    ...ad,
    user: user
      ? { id: user.id, name: user.name, avatar: user.avatar, rating: user.rating, verified: user.verified }
      : ad.user || null,
  };
}

// GET /api/ads
router.get("/", optionalAuth, (req, res) => {
  let ads = db.ads.filter((a) => a.status === "active");

  const { category, q, location, minPrice, maxPrice, condition, userId, limit, offset, sort } = req.query;

  if (userId) ads = ads.filter((a) => a.userId === userId);
  if (category && category !== "All") ads = ads.filter((a) => a.category === category);
  if (location) ads = ads.filter((a) => a.location?.toLowerCase().includes(location.toLowerCase()));
  if (condition) ads = ads.filter((a) => a.condition === condition);
  if (q) {
    const ql = q.toLowerCase();
    ads = ads.filter(
      (a) => a.title.toLowerCase().includes(ql) || a.description?.toLowerCase().includes(ql)
    );
  }
  if (minPrice) ads = ads.filter((a) => a.price >= Number(minPrice));
  if (maxPrice) ads = ads.filter((a) => a.price <= Number(maxPrice));

  // Sort
  if (sort === "price_asc") ads.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") ads.sort((a, b) => b.price - a.price);
  else ads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = ads.length;
  const off = Number(offset) || 0;
  const lim = Number(limit) || 30;
  ads = ads.slice(off, off + lim);

  res.json({ ads: ads.map(enrichAd), total, limit: lim, offset: off });
});

// GET /api/ads/saved/me
router.get("/saved/me", auth, (req, res) => {
  const savedIds = db.savedAds.filter((s) => s.userId === req.user.id).map((s) => s.adId);
  const ads = db.ads.filter((a) => savedIds.includes(a.id));
  res.json({ ads: ads.map(enrichAd) });
});

// GET /api/ads/:id
router.get("/:id", optionalAuth, (req, res) => {
  const ad = db.ads.find((a) => a.id === req.params.id);
  if (!ad) return res.status(404).json({ message: "Ad not found" });
  // increment views
  ad.views = (ad.views || 0) + 1;
  saveData();
  res.json(enrichAd(ad));
});

// POST /api/ads
router.post("/", auth, (req, res) => {
  try {
    const { title, description, price, category, condition, location, images } = req.body;
    if (!title || !price) return res.status(400).json({ message: "Title and price are required" });

    const ad = {
      id: uuidv4(),
      userId: req.user.id,
      title: title.trim(),
      description: description || "",
      price: Number(price),
      category: category || "Other",
      condition: condition || "Good",
      location: location || req.user.location || "",
      images: images || [],
      isFeatured: false,
      isPromoted: false,
      views: 0,
      likes: 0,
      saves: 0,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    db.ads.unshift(ad);
    saveData();
    res.status(201).json(enrichAd(ad));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/ads/:id
router.put("/:id", auth, (req, res) => {
  const idx = db.ads.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Ad not found" });
  if (db.ads[idx].userId !== req.user.id && !req.user.isAdmin)
    return res.status(403).json({ message: "Not authorized" });

  const allowed = ["title", "description", "price", "category", "condition", "location", "images", "status"];
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) db.ads[idx][k] = req.body[k];
  });
  db.ads[idx].updatedAt = new Date().toISOString();
  saveData();
  res.json(enrichAd(db.ads[idx]));
});

// DELETE /api/ads/:id
router.delete("/:id", auth, (req, res) => {
  const idx = db.ads.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Ad not found" });
  if (db.ads[idx].userId !== req.user.id && !req.user.isAdmin)
    return res.status(403).json({ message: "Not authorized" });

  db.ads.splice(idx, 1);
  saveData();
  res.json({ message: "Deleted" });
});

// POST /api/ads/:id/save  (toggle)
router.post("/:id/save", auth, (req, res) => {
  const adId = req.params.id;
  const userId = req.user.id;
  const idx = db.savedAds.findIndex((s) => s.userId === userId && s.adId === adId);
  if (idx === -1) {
    db.savedAds.push({ userId, adId });
    const ad = db.ads.find((a) => a.id === adId);
    if (ad) ad.saves = (ad.saves || 0) + 1;
    saveData();
    return res.json({ saved: true });
  } else {
    db.savedAds.splice(idx, 1);
    const ad = db.ads.find((a) => a.id === adId);
    if (ad && ad.saves > 0) ad.saves--;
    saveData();
    return res.json({ saved: false });
  }
});

// POST /api/ads/:id/like  (toggle)
router.post("/:id/like", auth, (req, res) => {
  const adId = req.params.id;
  const userId = req.user.id;
  const idx = db.adLikes.findIndex((l) => l.userId === userId && l.adId === adId);
  const ad = db.ads.find((a) => a.id === adId);
  if (idx === -1) {
    db.adLikes.push({ userId, adId });
    if (ad) ad.likes = (ad.likes || 0) + 1;
    saveData();
    return res.json({ liked: true, likes: ad?.likes });
  } else {
    db.adLikes.splice(idx, 1);
    if (ad && ad.likes > 0) ad.likes--;
    saveData();
    return res.json({ liked: false, likes: ad?.likes });
  }
});

// GET /api/ads/:id/comments
router.get("/:id/comments", optionalAuth, (req, res) => {
  const comments = db.adComments
    .filter((c) => c.adId === req.params.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((c) => {
      const user = db.users.find((u) => u.id === c.userId);
      return { ...c, user: user ? { id: user.id, name: user.name, avatar: user.avatar } : null };
    });
  res.json({ comments });
});

// POST /api/ads/:id/comment
router.post("/:id/comment", auth, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });
  const comment = {
    id: uuidv4(),
    adId: req.params.id,
    userId: req.user.id,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  db.adComments.push(comment);
  saveData();
  const user = req.user;
  res.status(201).json({
    ...comment,
    user: { id: user.id, name: user.name, avatar: user.avatar },
  });
});

module.exports = router;
