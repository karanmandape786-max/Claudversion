const router = require("express").Router();
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const { auth, optionalAuth, adminAuth } = require("../middleware/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const VALID_REFERRAL_CODES = [
  "DEALSARAMAMU","DEALSARAREEL","DEALSARAVIP","DEALSARABP",
  "DEALSARAXLO","DEALSARAPOP","DEALSARAKKIP","DEALSARA5I","DEALSARASTL"
];

// GET /api/competition/all — all competitions (for slider)
router.get("/all", optionalAuth, async (req, res) => {
  try {
    const { rows: comps } = await pool.query(
      "SELECT * FROM competitions ORDER BY created_at DESC"
    );
    res.json({ competitions: comps });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/competition/current
router.get("/current", optionalAuth, async (req, res) => {
  try {
    const { rows: compRows } = await pool.query(
      "SELECT * FROM competitions ORDER BY created_at DESC LIMIT 1"
    );
    if (!compRows.length) return res.status(404).json({ message: "No competition found" });
    const comp = compRows[0];

    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*) FROM competition_registrations WHERE competition_id=$1 AND payment_status='paid'",
      [comp.id]
    );

    const { rows: regs } = await pool.query(
      `SELECT cr.*, u.name as user_name, u.avatar as user_avatar
       FROM competition_registrations cr
       LEFT JOIN users u ON u.id = cr.user_id
       WHERE cr.competition_id=$1 AND cr.payment_status='paid'`,
      [comp.id]
    );

    const leaderboard = await Promise.all(regs.map(async reg => {
      const { rows: reels } = await pool.query(
        "SELECT views, likes FROM reels WHERE user_id=$1 AND is_competition=true",
        [reg.user_id]
      );
      const totalViews = reels.reduce((s, r) => s + (r.views || 0), 0);
      const totalLikes = reels.reduce((s, r) => s + (r.likes || 0), 0);
      return {
        userId: reg.user_id,
        name: reg.account_name || reg.user_name || reg.real_name,
        handle: (reg.account_name || reg.real_name || "user").toLowerCase().replace(/\s/g, ""),
        avatar: reg.user_avatar || null,
        views: totalViews,
        likes: totalLikes,
        score: totalViews + totalLikes * 2,
        reelCount: reels.length,
      };
    }));

    leaderboard.sort((a, b) => b.score - a.score);

    res.json({
      competition: { ...comp, registeredCount: parseInt(countRows[0].count) || 0 },
      leaderboard: leaderboard.map((p, i) => ({ ...p, rank: i + 1 })),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/competition/register
router.post("/register", auth, async (req, res) => {
  try {
    const { realName, accountName, email, phone, referralCode, competitionId } = req.body;
    if (!realName || !accountName || !email)
      return res.status(400).json({ message: "Real name, account name and email required" });

    let comp;
    if (competitionId) {
      const { rows } = await pool.query("SELECT * FROM competitions WHERE id=$1", [competitionId]);
      comp = rows[0];
    } else {
      const { rows } = await pool.query("SELECT * FROM competitions ORDER BY created_at DESC LIMIT 1");
      comp = rows[0];
    }
    if (!comp) return res.status(404).json({ message: "Competition not found" });

    const { rows: existing } = await pool.query(
      "SELECT id, payment_status FROM competition_registrations WHERE competition_id=$1 AND user_id=$2",
      [comp.id, req.userId]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: existing[0].payment_status === "paid" ? "Already registered and paid" : "Registration pending payment",
        registration: existing[0],
      });
    }

    const validRef = referralCode && VALID_REFERRAL_CODES.includes(referralCode.trim().toUpperCase());
    const amount = validRef ? (comp.discounted_fee || 34) : (comp.entry_fee || 39);

    const { rows: reg } = await pool.query(
      `INSERT INTO competition_registrations
        (id, competition_id, user_id, real_name, account_name, email, phone, referral_code, payment_status, amount_paid, registered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,NOW()) RETURNING *`,
      [uuidv4(), comp.id, req.userId, realName.trim(), accountName.trim(),
       email.toLowerCase().trim(), phone || "", referralCode?.toUpperCase() || null, amount]
    );

    res.status(201).json({ registration: reg[0], amount, message: `Registration created. Amount to pay: ₹${amount}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/competition/my-status
router.get("/my-status", auth, async (req, res) => {
  try {
    const { rows: compRows } = await pool.query("SELECT * FROM competitions ORDER BY created_at DESC LIMIT 1");
    if (!compRows.length) return res.json({ registered: false });
    const comp = compRows[0];

    const { rows: reg } = await pool.query(
      "SELECT * FROM competition_registrations WHERE competition_id=$1 AND user_id=$2",
      [comp.id, req.userId]
    );

    res.json({ registered: reg.length > 0, registration: reg[0] || null, competition: comp });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/competition/validate-referral/:code
router.get("/validate-referral/:code", (req, res) => {
  const code = req.params.code?.trim().toUpperCase();
  res.json({ valid: VALID_REFERRAL_CODES.includes(code), discount: VALID_REFERRAL_CODES.includes(code) ? 5 : 0 });
});

// POST /api/competition/payment-callback
router.post("/payment-callback", async (req, res) => {
  try {
    const { registrationId, status } = req.body;
    if (!registrationId) return res.status(400).json({ message: "registrationId required" });
    await pool.query(
      "UPDATE competition_registrations SET payment_status=$1 WHERE id=$2",
      [status === "success" ? "paid" : "failed", registrationId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ADMIN: get all registrations
router.get("/registrations", adminAuth, async (req, res) => {
  try {
    const { rows: compRows } = await pool.query("SELECT * FROM competitions ORDER BY created_at DESC LIMIT 1");
    if (!compRows.length) return res.json({ registrations: [] });
    const comp = compRows[0];

    const { rows: regs } = await pool.query(
      `SELECT cr.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
        (SELECT COUNT(*) FROM reels WHERE user_id=cr.user_id AND is_competition=true) as reel_count,
        (SELECT COALESCE(SUM(views),0) FROM reels WHERE user_id=cr.user_id AND is_competition=true) as views,
        (SELECT COALESCE(SUM(likes),0) FROM reels WHERE user_id=cr.user_id AND is_competition=true) as likes
       FROM competition_registrations cr
       LEFT JOIN users u ON u.id = cr.user_id
       WHERE cr.competition_id=$1
       ORDER BY cr.registered_at DESC`,
      [comp.id]
    );

    res.json({ registrations: regs, competition: comp });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ADMIN: mark paid
router.put("/registrations/:id/paid", adminAuth, async (req, res) => {
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

// ADMIN: create competition
router.post("/create", adminAuth, async (req, res) => {
  try {
    const { name, description, prize, entry_fee, discounted_fee, reg_opens, reg_closes, starts_at, results_at, status } = req.body;
    if (!name) return res.status(400).json({ message: "Name required" });

    const { rows } = await pool.query(
      `INSERT INTO competitions (id, name, description, prize, entry_fee, discounted_fee, reg_opens, reg_closes, starts_at, results_at, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING *`,
      [uuidv4(), name, description || "", prize || "₹5,000",
       entry_fee || 39, discounted_fee || 34,
       reg_opens || null, reg_closes || null, starts_at || null, results_at || null,
       status || "upcoming"]
    );
    res.status(201).json({ competition: rows[0] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ADMIN: update competition
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const { name, description, prize, entry_fee, discounted_fee, reg_opens, reg_closes, starts_at, results_at, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE competitions SET
        name=COALESCE($1,name), description=COALESCE($2,description),
        prize=COALESCE($3,prize), entry_fee=COALESCE($4,entry_fee),
        discounted_fee=COALESCE($5,discounted_fee), reg_opens=COALESCE($6,reg_opens),
        reg_closes=COALESCE($7,reg_closes), starts_at=COALESCE($8,starts_at),
        results_at=COALESCE($9,results_at), status=COALESCE($10,status)
       WHERE id=$11 RETURNING *`,
      [name||null, description||null, prize||null, entry_fee||null,
       discounted_fee||null, reg_opens||null, reg_closes||null,
       starts_at||null, results_at||null, status||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Competition not found" });
    res.json({ competition: rows[0] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ADMIN: delete competition
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM competitions WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
