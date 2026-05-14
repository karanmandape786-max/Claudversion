const router = require("express").Router();
const supabase = require("../supabase");
const { adminAuth } = require("../middleware/auth");

// GET /api/admin/stats
router.get("/stats", adminAuth, async (req, res) => {
  try {
    const [
      { count: totalUsers },
      { count: totalAds },
      { count: activeAds },
      { count: totalReels },
      { count: totalMessages },
      { count: totalConvs },
      { count: paidRegistrations },
      { count: totalRegistrations },
    ] = await Promise.all([
      supabase.from("users").select("id", { count: "exact" }).eq("is_admin", false),
      supabase.from("ads").select("id", { count: "exact" }),
      supabase.from("ads").select("id", { count: "exact" }).eq("status", "active"),
      supabase.from("reels").select("id", { count: "exact" }),
      supabase.from("messages").select("id", { count: "exact" }),
      supabase.from("conversations").select("id", { count: "exact" }),
      supabase.from("competition_registrations").select("id", { count: "exact" }).eq("payment_status", "paid"),
      supabase.from("competition_registrations").select("id", { count: "exact" }),
    ]);

    res.json({
      totalUsers: totalUsers || 0,
      totalAds: totalAds || 0,
      activeAds: activeAds || 0,
      totalReels: totalReels || 0,
      totalMessages: totalMessages || 0,
      totalConversations: totalConvs || 0,
      paidRegistrations: paidRegistrations || 0,
      totalRegistrations: totalRegistrations || 0,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/users
router.get("/users", adminAuth, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email, avatar, verified, is_admin, created_at, location")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ users: users || [] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", adminAuth, async (req, res) => {
  try {
    await supabase.from("users").delete().eq("id", req.params.id);
    res.json({ message: "User deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/ads
router.get("/ads", adminAuth, async (req, res) => {
  try {
    const { data: ads, error } = await supabase
      .from("ads")
      .select("*, users(id, name, email)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ ads: ads || [] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/admin/ads/:id
router.delete("/ads/:id", adminAuth, async (req, res) => {
  try {
    await supabase.from("ads").delete().eq("id", req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/admin/ads/:id/feature
router.put("/ads/:id/feature", adminAuth, async (req, res) => {
  try {
    const { data: ad } = await supabase.from("ads").select("is_featured").eq("id", req.params.id).single();
    const { data: updated, error } = await supabase
      .from("ads").update({ is_featured: !ad?.is_featured }).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ ad: updated });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/competition/registrations
router.get("/competition/registrations", adminAuth, async (req, res) => {
  try {
    const { data: regs, error } = await supabase
      .from("competition_registrations")
      .select("*, users(id, name, avatar)")
      .order("registered_at", { ascending: false });
    if (error) throw error;

    const enriched = await Promise.all((regs || []).map(async reg => {
      const { data: reels } = await supabase
        .from("reels").select("views, likes").eq("user_id", reg.user_id).eq("is_competition", true);
      const views = (reels || []).reduce((s, r) => s + (r.views || 0), 0);
      const likes = (reels || []).reduce((s, r) => s + (r.likes || 0), 0);
      return { ...reg, reelCount: (reels || []).length, views, likes, score: views + likes * 2 };
    }));

    res.json({ registrations: enriched });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/admin/competition/registrations/:id/paid
router.put("/competition/registrations/:id/paid", adminAuth, async (req, res) => {
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

// GET /api/admin/reels
router.get("/reels", adminAuth, async (req, res) => {
  try {
    const { data: reels, error } = await supabase
      .from("reels")
      .select("*, users(id, name, email)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ reels: reels || [] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/admin/reels/:id
router.delete("/reels/:id", adminAuth, async (req, res) => {
  try {
    await supabase.from("reels").delete().eq("id", req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
