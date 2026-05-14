const router = require("express").Router();
const supabase = require("../supabase");
const { auth, optionalAuth } = require("../middleware/auth");

// GET /api/reels  (includes competition reels)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { userId, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from("reels")
      .select("*, users(id, name, avatar, verified)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (userId) query = query.eq("user_id", userId);
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: reels, count, error } = await query;
    if (error) throw error;

    const myId = req.userId;
    const enriched = await Promise.all((reels || []).map(async r => {
      let isLiked = false, isSaved = false;
      if (myId) {
        const { data: like } = await supabase.from("reel_likes").select("reel_id").eq("user_id", myId).eq("reel_id", r.id).single();
        isLiked = !!like;
      }
      return {
        _id: r.id,
        ...r,
        user: r.users || null,
        isLiked,
        isBookmarked: isSaved,
        commentsCount: r.comments || 0,
      };
    }));

    res.json({ reels: enriched, total: count || 0, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/reels/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { data: reel, error } = await supabase
      .from("reels")
      .select("*, users(id, name, avatar, verified)")
      .eq("id", req.params.id)
      .single();

    if (error || !reel) return res.status(404).json({ message: "Reel not found" });

    await supabase.from("reels").update({ views: (reel.views || 0) + 1 }).eq("id", reel.id);

    res.json({ _id: reel.id, ...reel, user: reel.users, views: (reel.views || 0) + 1 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reels
router.post("/", auth, async (req, res) => {
  try {
    const { caption, description, videoUrl, thumbnail, adId, isCompetition, competitionId } = req.body;

    const { data: reel, error } = await supabase
      .from("reels")
      .insert({
        user_id: req.userId,
        caption: caption || "",
        description: description || "",
        video_url: videoUrl || null,
        thumbnail: thumbnail || null,
        ad_id: adId || null,
        is_competition: isCompetition || false,
        competition_id: competitionId || null,
      })
      .select("*, users(id, name, avatar, verified)")
      .single();

    if (error) throw error;
    res.status(201).json({ _id: reel.id, ...reel, user: reel.users });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reels/:id/like (toggle)
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from("reel_likes").select("reel_id").eq("user_id", req.userId).eq("reel_id", req.params.id).single();

    const { data: reel } = await supabase.from("reels").select("likes").eq("id", req.params.id).single();
    const cur = reel?.likes || 0;

    if (existing) {
      await supabase.from("reel_likes").delete().eq("user_id", req.userId).eq("reel_id", req.params.id);
      await supabase.from("reels").update({ likes: Math.max(0, cur - 1) }).eq("id", req.params.id);
      return res.json({ liked: false, likes: Math.max(0, cur - 1) });
    } else {
      await supabase.from("reel_likes").insert({ user_id: req.userId, reel_id: req.params.id });
      await supabase.from("reels").update({ likes: cur + 1 }).eq("id", req.params.id);
      return res.json({ liked: true, likes: cur + 1 });
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/reels/:id/comments
router.get("/:id/comments", optionalAuth, async (req, res) => {
  try {
    const { data: comments, error } = await supabase
      .from("reel_comments")
      .select("*, users(id, name, avatar)")
      .eq("reel_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ comments: (comments || []).map(c => ({ ...c, user: c.users })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reels/:id/comment
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });

    const { data: comment, error } = await supabase
      .from("reel_comments")
      .insert({ reel_id: req.params.id, user_id: req.userId, text: text.trim() })
      .select("*, users(id, name, avatar)")
      .single();

    if (error) throw error;

    // Increment comment count
    const { data: reel } = await supabase.from("reels").select("comments").eq("id", req.params.id).single();
    await supabase.from("reels").update({ comments: (reel?.comments || 0) + 1 }).eq("id", req.params.id);

    res.status(201).json({ ...comment, user: comment.users });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/reels/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { data: existing } = await supabase.from("reels").select("user_id").eq("id", req.params.id).single();
    if (!existing) return res.status(404).json({ message: "Reel not found" });
    if (existing.user_id !== req.userId && !req.userIsAdmin)
      return res.status(403).json({ message: "Not authorized" });

    await supabase.from("reels").delete().eq("id", req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
