const router = require("express").Router();
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const { auth, optionalAuth } = require("../middleware/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/reels
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { userId, limit = 50, offset = 0 } = req.query;
    let where = [];
    let vals = [];
    if (userId) { where.push(`r.user_id = $${vals.length+1}`); vals.push(userId); }
    const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM reels r ${whereStr}`, vals);
    const { rows: reels } = await pool.query(
      `SELECT r.*, u.name as user_name, u.avatar as user_avatar, u.verified as user_verified
       FROM reels r LEFT JOIN users u ON u.id=r.user_id
       ${whereStr}
       ORDER BY r.created_at DESC
       LIMIT $${vals.length+1} OFFSET $${vals.length+2}`,
      [...vals, Number(limit), Number(offset)]
    );

    const myId = req.userId;
    const enriched = await Promise.all(reels.map(async r => {
      let isLiked = false;
      if (myId) {
        const { rows } = await pool.query("SELECT 1 FROM reel_likes WHERE user_id=$1 AND reel_id=$2", [myId, r.id]);
        isLiked = rows.length > 0;
      }
      return {
        _id: r.id, ...r,
        user: { id: r.user_id, name: r.user_name, avatar: r.user_avatar, verified: r.user_verified },
        isLiked,
        commentsCount: r.comments || 0,
      };
    }));

    res.json({ reels: enriched, total: parseInt(countRows[0].count), limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    console.error("GET /reels error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// GET /api/reels/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name as user_name, u.avatar as user_avatar
       FROM reels r LEFT JOIN users u ON u.id=r.user_id
       WHERE r.id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Reel not found" });
    const r = rows[0];
    await pool.query("UPDATE reels SET views=views+1 WHERE id=$1", [r.id]);
    res.json({ _id: r.id, ...r, user: { name: r.user_name, avatar: r.user_avatar }, views: (r.views||0)+1 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reels — supports direct video upload as base64 or URL
router.post("/", auth, async (req, res) => {
  try {
    const { caption, description, videoUrl, videoBase64, thumbnail, adId, isCompetition, competitionId } = req.body;

    // videoBase64: if user uploads from gallery, frontend sends base64
    // For now store as data URL (in production use Cloudinary/S3)
    const finalVideoUrl = videoBase64
      ? `data:video/mp4;base64,${videoBase64.replace(/^data:video\/\w+;base64,/, "")}`
      : (videoUrl || null);

    const { rows } = await pool.query(
      `INSERT INTO reels (id, user_id, caption, description, video_url, thumbnail, ad_id, is_competition, competition_id, likes, views, comments, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,0,NOW()) RETURNING *`,
      [uuidv4(), req.userId, caption||"", description||"", finalVideoUrl, thumbnail||null,
       adId||null, isCompetition||false, competitionId||null]
    );
    const reel = rows[0];
    const { rows: userRows } = await pool.query("SELECT name, avatar FROM users WHERE id=$1", [req.userId]);
    res.status(201).json({ _id: reel.id, ...reel, user: userRows[0]||null });
  } catch (e) {
    console.error("POST /reels error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reels/:id/like (toggle)
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { rows: existing } = await pool.query("SELECT 1 FROM reel_likes WHERE user_id=$1 AND reel_id=$2", [req.userId, req.params.id]);
    if (existing.length) {
      await pool.query("DELETE FROM reel_likes WHERE user_id=$1 AND reel_id=$2", [req.userId, req.params.id]);
      await pool.query("UPDATE reels SET likes=GREATEST(likes-1,0) WHERE id=$1", [req.params.id]);
      const { rows } = await pool.query("SELECT likes FROM reels WHERE id=$1", [req.params.id]);
      res.json({ liked: false, likes: rows[0]?.likes||0 });
    } else {
      await pool.query("INSERT INTO reel_likes (user_id,reel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.userId, req.params.id]);
      await pool.query("UPDATE reels SET likes=likes+1 WHERE id=$1", [req.params.id]);
      const { rows } = await pool.query("SELECT likes FROM reels WHERE id=$1", [req.params.id]);
      res.json({ liked: true, likes: rows[0]?.likes||0 });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/reels/:id/comments
router.get("/:id/comments", optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT rc.*, u.name as user_name, u.avatar as user_avatar
       FROM reel_comments rc LEFT JOIN users u ON u.id=rc.user_id
       WHERE rc.reel_id=$1 ORDER BY rc.created_at DESC`,
      [req.params.id]
    );
    res.json({ comments: rows.map(c => ({ ...c, user: { name: c.user_name, avatar: c.user_avatar } })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reels/:id/comment
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });
    const { rows } = await pool.query(
      "INSERT INTO reel_comments (id,reel_id,user_id,text,created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *",
      [uuidv4(), req.params.id, req.userId, text.trim()]
    );
    await pool.query("UPDATE reels SET comments=comments+1 WHERE id=$1", [req.params.id]);
    const { rows: userRows } = await pool.query("SELECT name, avatar FROM users WHERE id=$1", [req.userId]);
    res.status(201).json({ ...rows[0], user: userRows[0]||null });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/reels/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT user_id FROM reels WHERE id=$1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Reel not found" });
    if (rows[0].user_id !== req.userId && !req.userIsAdmin) return res.status(403).json({ message: "Not authorized" });
    await pool.query("DELETE FROM reels WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
