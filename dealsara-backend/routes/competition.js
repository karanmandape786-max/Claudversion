const router = require("express").Router();
const supabase = require("../supabase");
const { auth, optionalAuth, adminAuth } = require("../middleware/auth");

const VALID_REFERRAL_CODES = [
  "DEALSARAMAMU","DEALSARAREEL","DEALSARAVIP","DEALSARABP",
  "DEALSARAXLO","DEALSARAPOP","DEALSARAKKIP","DEALSARA5I","DEALSARASTL"
];

// GET /api/competition/current  — active competition info + leaderboard
router.get("/current", optionalAuth, async (req, res) => {
  try {
    // Get active (or most recent) competition
    const { data: comp, error: ce } = await supabase
      .from("competitions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (ce || !comp) return res.status(404).json({ message: "No competition found" });

    // Registration count
    const { count: regCount } = await supabase
      .from("competition_registrations")
      .select("id", { count: "exact" })
      .eq("competition_id", comp.id)
      .eq("payment_status", "paid");

    // Leaderboard: participants with their reel stats (views + likes from competition reels)
    const { data: regs } = await supabase
      .from("competition_registrations")
      .select("*, users(id, name, avatar)")
      .eq("competition_id", comp.id)
      .eq("payment_status", "paid");

    // For each participant fetch their competition reels stats
    const leaderboard = await Promise.all((regs || []).map(async reg => {
      const { data: reels } = await supabase
        .from("reels")
        .select("views, likes")
        .eq("user_id", reg.user_id)
        .eq("is_competition", true);

      const totalViews = (reels || []).reduce((s, r) => s + (r.views || 0), 0);
      const totalLikes = (reels || []).reduce((s, r) => s + (r.likes || 0), 0);
      const score = totalViews * 1 + totalLikes * 2;

      return {
        userId: reg.user_id,
        name: reg.account_name || reg.users?.name || reg.real_name,
        handle: (reg.account_name || reg.real_name || "user").toLowerCase().replace(/\s/g, ""),
        avatar: reg.users?.avatar || null,
        views: totalViews,
        likes: totalLikes,
        score,
        reelCount: (reels || []).length,
      };
    }));

    leaderboard.sort((a, b) => b.score - a.score);

    res.json({
      competition: {
        ...comp,
        registeredCount: regCount || 0,
      },
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

    // Get competition
    let comp;
    if (competitionId) {
      const { data } = await supabase.from("competitions").select("*").eq("id", competitionId).single();
      comp = data;
    } else {
      const { data } = await supabase.from("competitions").select("*").order("created_at", { ascending: false }).limit(1).single();
      comp = data;
    }
    if (!comp) return res.status(404).json({ message: "Competition not found" });

    // Check already registered
    const { data: existing } = await supabase
      .from("competition_registrations")
      .select("id, payment_status")
      .eq("competition_id", comp.id)
      .eq("user_id", req.userId)
      .single();

    if (existing) {
      return res.status(409).json({
        message: existing.payment_status === "paid"
          ? "Already registered and paid"
          : "Registration pending payment",
        registration: existing,
      });
    }

    const validRef = referralCode && VALID_REFERRAL_CODES.includes(referralCode.trim().toUpperCase());
    const amount = validRef ? comp.discounted_fee : comp.entry_fee;

    const { data: reg, error } = await supabase
      .from("competition_registrations")
      .insert({
        competition_id: comp.id,
        user_id: req.userId,
        real_name: realName.trim(),
        account_name: accountName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone || "",
        referral_code: referralCode?.toUpperCase() || null,
        payment_status: "pending",
        amount_paid: amount,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      registration: reg,
      amount,
      message: `Registration created. Amount to pay: ₹${amount}`,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/competition/payment-callback (webhook from payment gateway)
router.post("/payment-callback", async (req, res) => {
  try {
    const { registrationId, status, txnId } = req.body;
    if (!registrationId) return res.status(400).json({ message: "registrationId required" });

    const newStatus = status === "success" ? "paid" : "failed";
    await supabase
      .from("competition_registrations")
      .update({ payment_status: newStatus })
      .eq("id", registrationId);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/competition/my-status
router.get("/my-status", auth, async (req, res) => {
  try {
    const { data: comp } = await supabase
      .from("competitions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!comp) return res.json({ registered: false });

    const { data: reg } = await supabase
      .from("competition_registrations")
      .select("*")
      .eq("competition_id", comp.id)
      .eq("user_id", req.userId)
      .single();

    res.json({ registered: !!reg, registration: reg || null, competition: comp });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/competition/validate-referral/:code
router.get("/validate-referral/:code", (req, res) => {
  const code = req.params.code?.trim().toUpperCase();
  const valid = VALID_REFERRAL_CODES.includes(code);
  res.json({ valid, discount: valid ? 5 : 0 });
});

// ADMIN: mark registration as paid
router.put("/registrations/:id/paid", adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("competition_registrations")
      .update({ payment_status: "paid" })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ADMIN: get all registrations
router.get("/registrations", adminAuth, async (req, res) => {
  try {
    const { data: comp } = await supabase
      .from("competitions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!comp) return res.json({ registrations: [] });

    const { data: regs, error } = await supabase
      .from("competition_registrations")
      .select("*, users(id, name, email, avatar)")
      .eq("competition_id", comp.id)
      .order("registered_at", { ascending: false });

    if (error) throw error;
    res.json({ registrations: regs || [], competition: comp });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
