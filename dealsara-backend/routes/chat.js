const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const { db, saveData } = require("../db");
const { auth } = require("../middleware/auth");

function getOrCreateConversation(user1Id, user2Id, adId) {
  let conv = db.conversations.find(
    (c) =>
      ((c.user1Id === user1Id && c.user2Id === user2Id) ||
        (c.user1Id === user2Id && c.user2Id === user1Id)) &&
      (adId ? c.adId === adId : true)
  );
  if (!conv) {
    conv = {
      id: uuidv4(),
      user1Id,
      user2Id,
      adId: adId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: null,
      unread: { [user1Id]: 0, [user2Id]: 0 },
    };
    db.conversations.push(conv);
    saveData();
  }
  return conv;
}

function enrichConversation(conv, myId) {
  const otherId = conv.user1Id === myId ? conv.user2Id : conv.user1Id;
  const other = db.users.find((u) => u.id === otherId);
  const ad = conv.adId ? db.ads.find((a) => a.id === conv.adId) : null;
  const msgs = db.messages.filter((m) => m.conversationId === conv.id);
  return {
    ...conv,
    other: other ? { id: other.id, name: other.name, avatar: other.avatar } : null,
    ad: ad ? { id: ad.id, title: ad.title, price: ad.price, images: ad.images } : null,
    messageCount: msgs.length,
    unreadCount: conv.unread?.[myId] || 0,
  };
}

// GET /api/chat/conversations
router.get("/conversations", auth, (req, res) => {
  const myId = req.user.id;
  const convs = db.conversations
    .filter((c) => c.user1Id === myId || c.user2Id === myId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((c) => enrichConversation(c, myId));
  res.json({ conversations: convs });
});

// GET /api/chat/conversations/:id
router.get("/conversations/:id", auth, (req, res) => {
  const conv = db.conversations.find((c) => c.id === req.params.id);
  if (!conv) return res.status(404).json({ message: "Conversation not found" });
  if (conv.user1Id !== req.user.id && conv.user2Id !== req.user.id)
    return res.status(403).json({ message: "Not authorized" });

  const messages = db.messages
    .filter((m) => m.conversationId === conv.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((m) => {
      const sender = db.users.find((u) => u.id === m.senderId);
      return { ...m, sender: sender ? { id: sender.id, name: sender.name, avatar: sender.avatar } : null };
    });

  res.json({ conversation: enrichConversation(conv, req.user.id), messages });
});

// PUT /api/chat/conversations/:id/read
router.put("/conversations/:id/read", auth, (req, res) => {
  const conv = db.conversations.find((c) => c.id === req.params.id);
  if (!conv) return res.status(404).json({ message: "Conversation not found" });
  if (!conv.unread) conv.unread = {};
  conv.unread[req.user.id] = 0;
  saveData();
  res.json({ ok: true });
});

// POST /api/chat/conversations/:id/message
router.post("/conversations/:id/message", auth, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: "Message text required" });

  const conv = db.conversations.find((c) => c.id === req.params.id);
  if (!conv) return res.status(404).json({ message: "Conversation not found" });
  if (conv.user1Id !== req.user.id && conv.user2Id !== req.user.id)
    return res.status(403).json({ message: "Not authorized" });

  const msg = {
    id: uuidv4(),
    conversationId: conv.id,
    senderId: req.user.id,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  db.messages.push(msg);
  conv.lastMessage = { text: msg.text, createdAt: msg.createdAt, senderId: msg.senderId };
  conv.updatedAt = msg.createdAt;

  // increment unread for the other person
  const otherId = conv.user1Id === req.user.id ? conv.user2Id : conv.user1Id;
  if (!conv.unread) conv.unread = {};
  conv.unread[otherId] = (conv.unread[otherId] || 0) + 1;

  saveData();
  const sender = req.user;
  res.status(201).json({ ...msg, sender: { id: sender.id, name: sender.name, avatar: sender.avatar } });
});

// POST /api/chat/start  (start or get a conversation)
router.post("/start", auth, (req, res) => {
  const { userId, adId, text } = req.body;
  if (!userId) return res.status(400).json({ message: "userId required" });
  if (userId === req.user.id) return res.status(400).json({ message: "Cannot message yourself" });

  const conv = getOrCreateConversation(req.user.id, userId, adId);

  if (text?.trim()) {
    const msg = {
      id: uuidv4(),
      conversationId: conv.id,
      senderId: req.user.id,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    db.messages.push(msg);
    conv.lastMessage = { text: msg.text, createdAt: msg.createdAt, senderId: msg.senderId };
    conv.updatedAt = msg.createdAt;
    if (!conv.unread) conv.unread = {};
    conv.unread[userId] = (conv.unread[userId] || 0) + 1;
    saveData();
  }

  res.json({ conversation: enrichConversation(conv, req.user.id), conversationId: conv.id });
});

// GET /api/chat/unread
router.get("/unread", auth, (req, res) => {
  const myId = req.user.id;
  let total = 0;
  db.conversations
    .filter((c) => c.user1Id === myId || c.user2Id === myId)
    .forEach((c) => { total += c.unread?.[myId] || 0; });
  res.json({ unread: total });
});

module.exports = router;
