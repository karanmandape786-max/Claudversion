const router = require("express").Router();
const supabase = require("../supabase");
const { optionalAuth } = require("../middleware/auth");

// GET /api/users/suggestions
router.get("/suggestions", optionalAuth, async (req, res) => {
  try {
    let query = supabase.from("users").select("id, name, avatar, location, verified, rating").eq("is_admin", false).limit(5);
    if (req.userId) query = query.neq("id", req.userId);
    const { data: users } = await query;
    res.json({ users: users || [] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/users/leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const { data: users } = await supabase
      .from("users")
      .select("id, name, avatar, location, verified, rating, total_sales")
      .eq("is_admin", false)
      .limit(20);

    const leaders = await Promise.all((users || []).map(async u => {
      const { count: adCount } = await supabase.from("ads").select("id", { count: "exact" }).eq("user_id", u.id).eq("status", "active");
      const { data: adLikes } = await supabase.from("ad_likes").select("ad_id").eq("user_id", u.id); // This isn't right - need total likes on user's ads
      const { data: ads } = await supabase.from("ads").select("likes").eq("user_id", u.id);
      const totalLikes = (ads || []).reduce((s, a) => s + (a.likes || 0), 0);
      const score = (adCount || 0) * 10 + totalLikes;
      return { ...u, adCount: adCount || 0, totalLikes, score };
    }));

    leaders.sort((a, b) => b.score - a.score);
    res.json({ leaderboard: leaders.map((u, i) => ({ ...u, rank: i + 1 })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/users/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, avatar, bio, location, verified, rating, total_sales, created_at, followers, following")
      .eq("id", req.params.id)
      .single();

    if (error || !user) return res.status(404).json({ message: "User not found" });

    const { count: adCount } = await supabase.from("ads").select("id", { count: "exact" }).eq("user_id", user.id).eq("status", "active");
    res.json({ ...user, adCount: adCount || 0 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/users/:id/ads
router.get("/:id/ads", optionalAuth, async (req, res) => {
  try {
    const { data: ads, error } = await supabase.from("ads").select("*").eq("user_id", req.params.id).eq("status", "active").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ ads: ads || [] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
