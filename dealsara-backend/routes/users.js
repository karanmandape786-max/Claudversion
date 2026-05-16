const router = require("express").Router();
const { Pool } = require("pg");
const { optionalAuth } = require("../middleware/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/users/suggestions
router.get("/suggestions", optionalAuth, async (req, res) => {
  try {
    let sql = "SELECT id, name, avatar, location, verified, rating FROM users WHERE is_admin=false";
    let vals = [];
    if (req.userId) { sql += " AND id != $1"; vals.push(req.userId); }
    sql += " ORDER BY created_at DESC LIMIT 5";
    const { rows } = await pool.query(sql, vals);
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/users/leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.location, u.verified, u.rating, u.total_sales,
        (SELECT COUNT(*) FROM ads WHERE user_id=u.id AND status='active') as ad_count,
        (SELECT COALESCE(SUM(likes),0) FROM ads WHERE user_id=u.id) as total_likes
       FROM users u WHERE u.is_admin=false
       ORDER BY total_likes DESC LIMIT 20`
    );
    const leaders = users.map((u, i) => ({
      ...u,
      adCount: parseInt(u.ad_count)||0,
      totalLikes: parseInt(u.total_likes)||0,
      score: (parseInt(u.ad_count)||0)*10 + (parseInt(u.total_likes)||0),
      rank: i+1,
    }));
    leaders.sort((a,b) => b.score - a.score);
    res.json({ leaderboard: leaders.map((u,i) => ({...u, rank: i+1})) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/users/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, avatar, bio, location, verified, rating, total_sales, created_at, followers, following FROM users WHERE id=$1",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    const user = rows[0];
    const { rows: adCount } = await pool.query("SELECT COUNT(*) FROM ads WHERE user_id=$1 AND status='active'", [user.id]);
    res.json({ ...user, adCount: parseInt(adCount[0].count)||0 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/users/:id/ads
router.get("/:id/ads", optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM ads WHERE user_id=$1 AND status='active' ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json({ ads: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
