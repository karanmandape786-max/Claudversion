const router = require("express").Router();
const supabase = require("../supabase");
const { auth } = require("../middleware/auth");

// GET /api/chat/conversations
router.get("/conversations", auth, async (req, res) => {
  try {
    const myId = req.userId;
    const { data: convs, error } = await supabase
      .from("conversations")
      .select("*, p1:users!participant1_id(id,name,avatar), p2:users!participant2_id(id,name,avatar), ads(id,title,price,images)")
      .or(`participant1_id.eq.${myId},participant2_id.eq.${myId}`)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const enriched = (convs || []).map(c => {
      const other = c.participant1_id === myId ? c.p2 : c.p1;
      const unread = c.participant1_id === myId ? c.unread1 : c.unread2;
      return {
        id: c.id,
        other,
        ad: c.ads || null,
        lastMessage: c.last_message,
        lastMessageAt: c.last_message_at,
        unreadCount: unread || 0,
        updatedAt: c.updated_at,
      };
    });

    res.json({ conversations: enriched });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/chat/conversations/:id
router.get("/conversations/:id", auth, async (req, res) => {
  try {
    const myId = req.userId;
    const { data: conv, error: ce } = await supabase
      .from("conversations")
      .select("*, p1:users!participant1_id(id,name,avatar), p2:users!participant2_id(id,name,avatar)")
      .eq("id", req.params.id)
      .single();

    if (ce || !conv) return res.status(404).json({ message: "Conversation not found" });
    if (conv.participant1_id !== myId && conv.participant2_id !== myId)
      return res.status(403).json({ message: "Not authorized" });

    const { data: messages, error: me } = await supabase
      .from("messages")
      .select("*, users(id,name,avatar)")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    if (me) throw me;

    const other = conv.participant1_id === myId ? conv.p2 : conv.p1;
    res.json({
      conversation: { id: conv.id, other },
      messages: (messages || []).map(m => ({ ...m, sender: m.users })),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/chat/conversations/:id/read
router.put("/conversations/:id/read", auth, async (req, res) => {
  try {
    const { data: conv } = await supabase.from("conversations").select("participant1_id, participant2_id").eq("id", req.params.id).single();
    if (!conv) return res.status(404).json({ message: "Not found" });

    const field = conv.participant1_id === req.userId ? "unread1" : "unread2";
    await supabase.from("conversations").update({ [field]: 0 }).eq("id", req.params.id);

    // mark messages read
    await supabase.from("messages").update({ is_read: true })
      .eq("conversation_id", req.params.id)
      .neq("sender_id", req.userId);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/chat/conversations/:id/message
router.post("/conversations/:id/message", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Message text required" });

    const { data: conv } = await supabase
      .from("conversations").select("participant1_id, participant2_id, unread1, unread2")
      .eq("id", req.params.id).single();

    if (!conv) return res.status(404).json({ message: "Conversation not found" });
    if (conv.participant1_id !== req.userId && conv.participant2_id !== req.userId)
      return res.status(403).json({ message: "Not authorized" });

    const { data: msg, error } = await supabase
      .from("messages")
      .insert({ conversation_id: req.params.id, sender_id: req.userId, text: text.trim() })
      .select("*, users(id,name,avatar)")
      .single();

    if (error) throw error;

    // update conversation
    const isP1 = conv.participant1_id === req.userId;
    await supabase.from("conversations").update({
      last_message: text.trim(),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      unread1: isP1 ? conv.unread1 : (conv.unread1 || 0) + 1,
      unread2: isP1 ? (conv.unread2 || 0) + 1 : conv.unread2,
    }).eq("id", req.params.id);

    res.status(201).json({ ...msg, sender: msg.users });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/chat/start
router.post("/start", auth, async (req, res) => {
  try {
    const { userId, adId, text } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });
    if (userId === req.userId) return res.status(400).json({ message: "Cannot chat with yourself" });

    // find existing
    let { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .or(
        `and(participant1_id.eq.${req.userId},participant2_id.eq.${userId}),and(participant1_id.eq.${userId},participant2_id.eq.${req.userId})`
      )
      .maybeSingle();

    if (!conv) {
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({ participant1_id: req.userId, participant2_id: userId, ad_id: adId || null })
        .select()
        .single();
      if (error) throw error;
      conv = newConv;
    }

    if (text?.trim()) {
      await supabase.from("messages").insert({ conversation_id: conv.id, sender_id: req.userId, text: text.trim() });
      await supabase.from("conversations").update({
        last_message: text.trim(),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        unread2: (conv.unread2 || 0) + 1,
      }).eq("id", conv.id);
    }

    res.json({ conversationId: conv.id, conversation: conv });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/chat/unread
router.get("/unread", auth, async (req, res) => {
  try {
    const myId = req.userId;
    const { data: convs } = await supabase
      .from("conversations")
      .select("participant1_id, unread1, unread2")
      .or(`participant1_id.eq.${myId},participant2_id.eq.${myId}`);

    let total = 0;
    (convs || []).forEach(c => {
      total += c.participant1_id === myId ? (c.unread1 || 0) : (c.unread2 || 0);
    });

    res.json({ count: total, unread: total });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
