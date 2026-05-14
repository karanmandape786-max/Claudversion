const router = require("express").Router();
const supabase = require("../supabase");
const { auth, optionalAuth } = require("../middleware/auth");

// Helper: join user data to ad
async function enrichAd(ad, userId = null) {
  const { data: user } = await supabase
    .from("users")
    .select("id, name, avatar, rating, verified")
    .eq("id", ad.user_id)
    .single();

  let isLiked = false, isSaved = false;
  if (userId) {
    const [{ data: like }, { data: save }] = await Promise.all([
      supabase.from("ad_likes").select("ad_id").eq("user_id", userId).eq("ad_id", ad.id).single(),
      supabase.from("saved_ads").select("ad_id").eq("user_id", userId).eq("ad_id", ad.id).single(),
    ]);
    isLiked = !!like;
    isSaved = !!save;
  }

  return {
    _id: ad.id,
    ...ad,
    user: user || null,
    isLiked,
    isBookmarked: isSaved,
  };
}

// GET /api/ads
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { category, q, location, minPrice, maxPrice, condition, userId, limit = 30, offset = 0, sort } = req.query;

    let query = supabase
      .from("ads")
      .select("*", { count: "exact" })
      .eq("status", "active");

    if (userId) query = query.eq("user_id", userId);
    if (category && category !== "All") query = query.eq("category", category);
    if (condition) query = query.eq("condition", condition);
    if (location) query = query.ilike("location", `%${location}%`);
    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    if (minPrice) query = query.gte("price", Number(minPrice));
    if (maxPrice) query = query.lte("price", Number(maxPrice));

    if (sort === "price_asc") query = query.order("price", { ascending: true });
    else if (sort === "price_desc") query = query.order("price", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: ads, count, error } = await query;
    if (error) throw error;

    res.json({ ads: ads || [], total: count || 0, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/ads/saved/me
router.get("/saved/me", auth, async (req, res) => {
  try {
    const { data: saved, error } = await supabase
      .from("saved_ads")
      .select("ad_id, ads(*)")
      .eq("user_id", req.userId);

    if (error) throw error;
    const ads = (saved || []).map(s => ({ _id: s.ad_id, ...s.ads }));
    res.json({ ads });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/ads/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { data: ad, error } = await supabase
      .from("ads")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !ad) return res.status(404).json({ message: "Ad not found" });

    // Increment views
    await supabase.from("ads").update({ views: (ad.views || 0) + 1 }).eq("id", ad.id);

    const enriched = await enrichAd({ ...ad, views: (ad.views || 0) + 1 }, req.userId);
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads
router.post("/", auth, async (req, res) => {
  try {
    const { title, description, price, category, condition, location, images, videoUrl } = req.body;
    if (!title || price === undefined)
      return res.status(400).json({ message: "Title and price required" });

    const { data: ad, error } = await supabase
      .from("ads")
      .insert({
        user_id: req.userId,
        title: title.trim(),
        description: description || "",
        price: Number(price),
        category: category || "Other",
        condition: condition || "Good",
        location: location || "",
        images: images || [],
        video_url: videoUrl || null,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;
    const enriched = await enrichAd(ad, req.userId);
    res.status(201).json(enriched);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/ads/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const { data: existing } = await supabase.from("ads").select("user_id").eq("id", req.params.id).single();
    if (!existing) return res.status(404).json({ message: "Ad not found" });
    if (existing.user_id !== req.userId && !req.userIsAdmin)
      return res.status(403).json({ message: "Not authorized" });

    const allowed = ["title", "description", "price", "category", "condition", "location", "images", "status", "video_url"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date().toISOString();

    const { data: ad, error } = await supabase.from("ads").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(await enrichAd(ad, req.userId));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/ads/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { data: existing } = await supabase.from("ads").select("user_id").eq("id", req.params.id).single();
    if (!existing) return res.status(404).json({ message: "Ad not found" });
    if (existing.user_id !== req.userId && !req.userIsAdmin)
      return res.status(403).json({ message: "Not authorized" });

    await supabase.from("ads").delete().eq("id", req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads/:id/save (toggle)
router.post("/:id/save", auth, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from("saved_ads").select("ad_id").eq("user_id", req.userId).eq("ad_id", req.params.id).single();

    if (existing) {
      await supabase.from("saved_ads").delete().eq("user_id", req.userId).eq("ad_id", req.params.id);
      await supabase.rpc("decrement_ad_saves", { ad_id: req.params.id }).catch(() =>
        supabase.from("ads").update({ saves: supabase.raw("GREATEST(saves - 1, 0)") }).eq("id", req.params.id)
      );
      return res.json({ saved: false });
    } else {
      await supabase.from("saved_ads").insert({ user_id: req.userId, ad_id: req.params.id });
      await supabase.from("ads").update({ saves: supabase.raw ? supabase.raw("saves + 1") : 1 }).eq("id", req.params.id);
      return res.json({ saved: true });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads/:id/like (toggle)
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from("ad_likes").select("ad_id").eq("user_id", req.userId).eq("ad_id", req.params.id).single();

    const { data: ad } = await supabase.from("ads").select("likes").eq("id", req.params.id).single();
    const currentLikes = ad?.likes || 0;

    if (existing) {
      await supabase.from("ad_likes").delete().eq("user_id", req.userId).eq("ad_id", req.params.id);
      await supabase.from("ads").update({ likes: Math.max(0, currentLikes - 1) }).eq("id", req.params.id);
      return res.json({ liked: false, likes: Math.max(0, currentLikes - 1) });
    } else {
      await supabase.from("ad_likes").insert({ user_id: req.userId, ad_id: req.params.id });
      await supabase.from("ads").update({ likes: currentLikes + 1 }).eq("id", req.params.id);
      return res.json({ liked: true, likes: currentLikes + 1 });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/ads/:id/comments
router.get("/:id/comments", optionalAuth, async (req, res) => {
  try {
    const { data: comments, error } = await supabase
      .from("ad_comments")
      .select("*, users(id, name, avatar)")
      .eq("ad_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ comments: (comments || []).map(c => ({ ...c, user: c.users })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/ads/:id/comment
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });

    const { data: comment, error } = await supabase
      .from("ad_comments")
      .insert({ ad_id: req.params.id, user_id: req.userId, text: text.trim() })
      .select("*, users(id, name, avatar)")
      .single();

    if (error) throw error;
    res.status(201).json({ ...comment, user: comment.users });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
