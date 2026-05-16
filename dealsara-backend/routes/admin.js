const router = require("express").Router();
const { Pool } = require("pg");
const { adminAuth } = require("../middleware/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/admin/stats
router.get("/stats", adminAuth, async (req, res) => {
  try {
    const [users, ads, activeAds, reels, msgs, convs, paidRegs, totalRegs] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE is_admin=false"),
      pool.query("SELECT COUNT(*) FROM ads"),
      pool.query("SELECT COUNT(*) FROM ads WHERE status='active'"),
      pool.query("SELECT COUNT(*) FROM reels"),
      pool.query("SELECT COUNT(*) FROM messages"),
      pool.query("SELECT COUNT(*) FROM conversations"),
      pool.query("SELECT COUNT(*) FROM competition_registrations WHERE payment_status='paid'"),
      pool.query("SELECT COUNT(*) FROM competition_registrations"),
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalAds: parseInt(ads.rows[0].count),
      activeAds: parseInt(activeAds.rows[0].count),
      totalReels: parseInt(reels.rows[0].count),
      totalMessages: parseInt(msgs.rows[0].count),
      totalConversations: parseInt(convs.rows[0].count),
      paidRegistrations: parseInt(paidRegs.rows[0].count),
      totalRegistrations: parseInt(totalRegs.rows[0].count),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/users
router.get("/users", adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, avatar, verified, is_admin, created_at, location FROM users ORDER BY created_at DESC"
    );
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ message: "User deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/ads
router.get("/ads", adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.name as user_name, u.email as user_email
       FROM ads a LEFT JOIN users u ON u.id=a.user_id
       ORDER BY a.created_at DESC`
    );
    res.json({ ads: rows.map(a => ({ ...a, user: { name: a.user_name, email: a.user_email } })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/admin/ads/:id
router.delete("/ads/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM ads WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/admin/ads/:id/feature
router.put("/ads/:id/feature", adminAuth, async (req, res) => {
  try {
    const { rows: existing } = await pool.query("SELECT is_featured FROM ads WHERE id=$1", [req.params.id]);
    const { rows } = await pool.query(
      "UPDATE ads SET is_featured=$1 WHERE id=$2 RETURNING *",
      [!existing[0]?.is_featured, req.params.id]
    );
    res.json({ ad: rows[0] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/competition/registrations
router.get("/competition/registrations", adminAuth, async (req, res) => {
  try {
    const { rows: regs } = await pool.query(
      `SELECT cr.*, u.name as user_name, u.avatar as user_avatar,
        (SELECT COUNT(*) FROM reels WHERE user_id=cr.user_id AND is_competition=true) as reel_count,
        (SELECT COALESCE(SUM(views),0) FROM reels WHERE user_id=cr.user_id AND is_competition=true) as views,
        (SELECT COALESCE(SUM(likes),0) FROM reels WHERE user_id=cr.user_id AND is_competition=true) as likes
       FROM competition_registrations cr
       LEFT JOIN users u ON u.id=cr.user_id
       ORDER BY cr.registered_at DESC`
    );
    const enriched = regs.map(r => ({
      ...r,
      reelCount: parseInt(r.reel_count) || 0,
      views: parseInt(r.views) || 0,
      likes: parseInt(r.likes) || 0,
      score: (parseInt(r.views)||0) + (parseInt(r.likes)||0)*2,
    }));
    res.json({ registrations: enriched });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/admin/competition/registrations/:id/paid
router.put("/competition/registrations/:id/paid", adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE competition_registrations SET payment_status='paid' WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/reels
router.get("/reels", adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name as user_name, u.email as user_email
       FROM reels r LEFT JOIN users u ON u.id=r.user_id
       ORDER BY r.created_at DESC`
    );
    res.json({ reels: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/admin/reels/:id
router.delete("/reels/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM reels WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/competitions
router.get("/competitions", adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM competitions ORDER BY created_at DESC");
    res.json({ competitions: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
