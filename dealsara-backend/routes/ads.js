const router = require("express").Router();
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const { auth, optionalAuth } = require("../middleware/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/ads
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { category, q, location, minPrice, maxPrice, condition, userId, limit = 30, offset = 0, sort } = req.query;

    let where = ["a.status = 'active'"];
    let vals = [];
    let i = 1;

    if (userId)   { where.push(`a.user_id = $${i++}`);              vals.push(userId); }
    if (category && category !== "All") { where.push(`a.category = $${i++}`); vals.push(category); }
    if (condition) { where.push(`a.condition = $${i++}`);           vals.push(condition); }
    if (location)  { where.push(`a.location ILIKE $${i++}`);        vals.push(`%${location}%`); }
    if (q)         { where.push(`(a.title ILIKE $${i++} OR a.description ILIKE $${i++})`); vals.push(`%${q}%`); vals.push(`%${q}%`); i++; }
    if (minPrice)  { where.push(`a.price >= $${i++}`);              vals.push(Number(minPrice)); }
    if (maxPrice)  { where.push(`a.price <= $${i++}`);              vals.push(Number(maxPrice)); }

    const orderBy = sort === "price_asc" ? "a.price ASC"
                  : sort === "price_desc" ? "a.price DESC"
                  : "a.is_featured DESC, a.created_at DESC";

    const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) FROM ads a ${whereStr}`;
    const { rows: countRows } = await pool.query(countSql, vals);
    const total = parseInt(countRows[0].count);

    const sql = `
      SELECT a.*, u.name as user_name, u.avatar as user_avatar, u.verified as user_verified, u.rating as user_rating
      FROM ads a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereStr}
      ORDER BY ${orderBy}
      LIMIT $${i++} OFFSET $${i++}
    `;
    const { rows: ads } = await pool.query(sql, [...vals, Number(limit), Number(offset)]);

    const formatted = ads.map(ad => ({
      ...ad,
      _id: ad.id,
      images: ad.images || [],
      videos: ad.videos || [],
      user: { id: ad.user_id, name: ad.user_name, avatar: ad.user_avatar, verified: ad.user_verified, rating: ad.user_rating },
    }));

    res.json({ ads: formatted, total, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    console.error("GET /ads error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// GET /api/ads/saved/me
router.get("/saved/me", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.name as user_name, u.avatar as user_avatar
       FROM saved_ads sa
       JOIN ads a ON a.id = sa.ad_id
       LEFT JOIN users u ON u.id = a.user_id
       WHERE sa.user_id = $1`,
      [req.userId]
    );
    res.json({ ads: rows.map(a => ({ ...a, _id: a.id, user: { name: a.user_name, avatar: a.user_avatar } })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/ads/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.name as user_name, u.avatar as user_avatar, u.verified as user_verified
       FROM ads a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Ad not found" });
    const ad = rows[0];
    await pool.query("UPDATE ads SET views = views + 1 WHERE id = $1", [ad.id]);

    let isLiked = false, isSaved = false;
    if (req.userId) {
      const [l, s] = await Promise.all([
        pool.query("SELECT 1 FROM ad_likes WHERE user_id=$1 AND ad_id=$2", [req.userId, ad.id]),
        pool.query("SELECT 1 FROM saved_ads WHERE user_id=$1 AND ad_id=$2", [req.userId, ad.id]),
      ]);
      isLiked = l.rows.length > 0;
      isSaved = s.rows.length > 0;
    }

    res.json({
      ...ad, _id: ad.id,
      images: ad.images || [], videos: ad.videos || [],
      views: (ad.views || 0) + 1,
      user: { id: ad.user_id, name: ad.user_name, avatar: ad.user_avatar, verified: ad.user_verified },
      isLiked, isBookmarked: isSaved,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads
router.post("/", auth, async (req, res) => {
  try {
    const { title, description, price, category, condition, location, images, videos, videoUrl } = req.body;
    if (!title || price === undefined) return res.status(400).json({ message: "Title and price required" });

    // Support up to 8 images and 5 videos
    const imgArr = (images || []).slice(0, 8);
    const vidArr = (videos || []).slice(0, 5);
    const firstVideo = vidArr[0] || videoUrl || null;

    const { rows } = await pool.query(
      `INSERT INTO ads (id, user_id, title, description, price, category, condition, location, images, video_url, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',NOW(),NOW()) RETURNING *`,
      [uuidv4(), req.userId, title.trim(), description || "", Number(price),
       category || "Other", condition || "Good", location || "", imgArr, firstVideo]
    );
    const ad = rows[0];
    const { rows: userRows } = await pool.query("SELECT name, avatar FROM users WHERE id=$1", [req.userId]);
    res.status(201).json({ ...ad, _id: ad.id, user: userRows[0] || null });
  } catch (e) {
    console.error("POST /ads error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/ads/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const { rows: existing } = await pool.query("SELECT user_id FROM ads WHERE id=$1", [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: "Ad not found" });
    if (existing[0].user_id !== req.userId && !req.userIsAdmin) return res.status(403).json({ message: "Not authorized" });

    const { title, description, price, category, condition, location, images, videos, videoUrl, status } = req.body;
    const imgArr = images ? (images || []).slice(0, 8) : undefined;
    const firstVideo = videos ? (videos[0] || videoUrl || null) : (videoUrl || undefined);

    const { rows } = await pool.query(
      `UPDATE ads SET
        title=COALESCE($1,title), description=COALESCE($2,description),
        price=COALESCE($3,price), category=COALESCE($4,category),
        condition=COALESCE($5,condition), location=COALESCE($6,location),
        images=COALESCE($7,images), video_url=COALESCE($8,video_url),
        status=COALESCE($9,status), updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [title||null, description||null, price?Number(price):null, category||null,
       condition||null, location||null, imgArr||null, firstVideo||null, status||null, req.params.id]
    );
    res.json({ ...rows[0], _id: rows[0].id });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/ads/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT user_id FROM ads WHERE id=$1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Ad not found" });
    if (rows[0].user_id !== req.userId && !req.userIsAdmin) return res.status(403).json({ message: "Not authorized" });
    await pool.query("DELETE FROM ads WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads/:id/save (toggle)
router.post("/:id/save", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT 1 FROM saved_ads WHERE user_id=$1 AND ad_id=$2", [req.userId, req.params.id]);
    if (rows.length) {
      await pool.query("DELETE FROM saved_ads WHERE user_id=$1 AND ad_id=$2", [req.userId, req.params.id]);
      await pool.query("UPDATE ads SET saves=GREATEST(saves-1,0) WHERE id=$1", [req.params.id]);
      res.json({ saved: false });
    } else {
      await pool.query("INSERT INTO saved_ads (user_id,ad_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.userId, req.params.id]);
      await pool.query("UPDATE ads SET saves=saves+1 WHERE id=$1", [req.params.id]);
      res.json({ saved: true });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads/:id/like (toggle)
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT 1 FROM ad_likes WHERE user_id=$1 AND ad_id=$2", [req.userId, req.params.id]);
    if (rows.length) {
      await pool.query("DELETE FROM ad_likes WHERE user_id=$1 AND ad_id=$2", [req.userId, req.params.id]);
      await pool.query("UPDATE ads SET likes=GREATEST(likes-1,0) WHERE id=$1", [req.params.id]);
      const { rows: ad } = await pool.query("SELECT likes FROM ads WHERE id=$1", [req.params.id]);
      res.json({ liked: false, likes: ad[0]?.likes || 0 });
    } else {
      await pool.query("INSERT INTO ad_likes (user_id,ad_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.userId, req.params.id]);
      await pool.query("UPDATE ads SET likes=likes+1 WHERE id=$1", [req.params.id]);
      const { rows: ad } = await pool.query("SELECT likes FROM ads WHERE id=$1", [req.params.id]);
      res.json({ liked: true, likes: ad[0]?.likes || 0 });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/ads/:id/comments
router.get("/:id/comments", optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ac.*, u.name as user_name, u.avatar as user_avatar
       FROM ad_comments ac LEFT JOIN users u ON u.id = ac.user_id
       WHERE ac.ad_id=$1 ORDER BY ac.created_at DESC`,
      [req.params.id]
    );
    res.json({ comments: rows.map(c => ({ ...c, user: { name: c.user_name, avatar: c.user_avatar } })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads/:id/comment
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });
    const { rows } = await pool.query(
      `INSERT INTO ad_comments (id, ad_id, user_id, text, created_at)
       VALUES ($1,$2,$3,$4,NOW()) RETURNING *`,
      [uuidv4(), req.params.id, req.userId, text.trim()]
    );
    const { rows: userRows } = await pool.query("SELECT name, avatar FROM users WHERE id=$1", [req.userId]);
    res.status(201).json({ ...rows[0], user: userRows[0] || null });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
