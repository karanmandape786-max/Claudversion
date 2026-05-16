const router = require("express").Router();
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/chat/conversations
router.get("/conversations", auth, async (req, res) => {
  try {
    const myId = req.userId;
    const { rows: convs } = await pool.query(
      `SELECT c.*,
        p1.id as p1_id, p1.name as p1_name, p1.avatar as p1_avatar,
        p2.id as p2_id, p2.name as p2_name, p2.avatar as p2_avatar,
        a.id as ad_id, a.title as ad_title, a.price as ad_price, a.images as ad_images
       FROM conversations c
       LEFT JOIN users p1 ON p1.id = c.participant1_id
       LEFT JOIN users p2 ON p2.id = c.participant2_id
       LEFT JOIN ads a ON a.id = c.ad_id
       WHERE c.participant1_id=$1 OR c.participant2_id=$1
       ORDER BY c.updated_at DESC`,
      [myId]
    );

    const enriched = convs.map(c => {
      const isP1 = c.participant1_id === myId;
      const other = isP1
        ? { id: c.p2_id, name: c.p2_name, avatar: c.p2_avatar }
        : { id: c.p1_id, name: c.p1_name, avatar: c.p1_avatar };
      return {
        id: c.id,
        _id: c.id,
        participants: [
          { _id: c.participant1_id, name: c.p1_name, avatar: c.p1_avatar },
          { _id: c.participant2_id, name: c.p2_name, avatar: c.p2_avatar },
        ],
        other,
        ad: c.ad_id ? { id: c.ad_id, title: c.ad_title, price: c.ad_price, images: c.ad_images } : null,
        lastMessage: { text: c.last_message, createdAt: c.last_message_at, sender: isP1 ? { _id: c.participant1_id } : { _id: c.participant2_id } },
        unreadCount: isP1 ? (c.unread1 || 0) : (c.unread2 || 0),
        updatedAt: c.updated_at,
      };
    });

    res.json(enriched);
  } catch (e) {
    console.error("GET /conversations error:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// GET /api/chat/conversations/:id
router.get("/conversations/:id", auth, async (req, res) => {
  try {
    const myId = req.userId;
    const { rows: convRows } = await pool.query(
      `SELECT c.*,
        p1.id as p1_id, p1.name as p1_name, p1.avatar as p1_avatar,
        p2.id as p2_id, p2.name as p2_name, p2.avatar as p2_avatar
       FROM conversations c
       LEFT JOIN users p1 ON p1.id=c.participant1_id
       LEFT JOIN users p2 ON p2.id=c.participant2_id
       WHERE c.id=$1`,
      [req.params.id]
    );
    if (!convRows.length) return res.status(404).json({ message: "Conversation not found" });
    const conv = convRows[0];
    if (conv.participant1_id !== myId && conv.participant2_id !== myId)
      return res.status(403).json({ message: "Not authorized" });

    const { rows: messages } = await pool.query(
      `SELECT m.*, u.id as sender_id_u, u.name as sender_name, u.avatar as sender_avatar
       FROM messages m LEFT JOIN users u ON u.id=m.sender_id
       WHERE m.conversation_id=$1 ORDER BY m.created_at ASC`,
      [conv.id]
    );

    const other = conv.participant1_id === myId
      ? { id: conv.p2_id, name: conv.p2_name, avatar: conv.p2_avatar }
      : { id: conv.p1_id, name: conv.p1_name, avatar: conv.p1_avatar };

    res.json({
      conversation: { id: conv.id, other },
      messages: messages.map(m => ({
        ...m,
        _id: m.id,
        sender: { _id: m.sender_id, name: m.sender_name, avatar: m.sender_avatar },
        readBy: m.is_read ? [conv.participant1_id, conv.participant2_id] : [m.sender_id],
      })),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/chat/conversations/:id/read
router.put("/conversations/:id/read", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT participant1_id FROM conversations WHERE id=$1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    const field = rows[0].participant1_id === req.userId ? "unread1" : "unread2";
    await pool.query(`UPDATE conversations SET ${field}=0 WHERE id=$1`, [req.params.id]);
    await pool.query("UPDATE messages SET is_read=true WHERE conversation_id=$1 AND sender_id!=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/chat/conversations/:id/message
router.post("/conversations/:id/message", auth, async (req, res) => {
  try {
    const { message, text } = req.body;
    const msgText = (message || text || "").trim();
    if (!msgText) return res.status(400).json({ message: "Message text required" });

    const { rows: convRows } = await pool.query(
      "SELECT participant1_id, participant2_id, unread1, unread2 FROM conversations WHERE id=$1",
      [req.params.id]
    );
    if (!convRows.length) return res.status(404).json({ message: "Conversation not found" });
    const conv = convRows[0];
    if (conv.participant1_id !== req.userId && conv.participant2_id !== req.userId)
      return res.status(403).json({ message: "Not authorized" });

    const { rows: msgRows } = await pool.query(
      "INSERT INTO messages (id,conversation_id,sender_id,text,created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *",
      [uuidv4(), req.params.id, req.userId, msgText]
    );
    const msg = msgRows[0];

    const isP1 = conv.participant1_id === req.userId;
    await pool.query(
      `UPDATE conversations SET last_message=$1, last_message_at=NOW(), updated_at=NOW(),
       unread1=$2, unread2=$3 WHERE id=$4`,
      [msgText, isP1 ? conv.unread1 : (conv.unread1||0)+1, isP1 ? (conv.unread2||0)+1 : conv.unread2, req.params.id]
    );

    const { rows: userRows } = await pool.query("SELECT name, avatar FROM users WHERE id=$1", [req.userId]);
    res.status(201).json({ ...msg, _id: msg.id, sender: { _id: req.userId, ...userRows[0] } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/chat/start
router.post("/start", auth, async (req, res) => {
  try {
    const { userId, adId, message, text } = req.body;
    const msgText = (message || text || "").trim();
    if (!userId) return res.status(400).json({ message: "userId required" });
    if (userId === req.userId) return res.status(400).json({ message: "Cannot chat with yourself" });

    const { rows: existing } = await pool.query(
      `SELECT * FROM conversations WHERE
       (participant1_id=$1 AND participant2_id=$2) OR
       (participant1_id=$2 AND participant2_id=$1) LIMIT 1`,
      [req.userId, userId]
    );

    let conv;
    if (existing.length) {
      conv = existing[0];
    } else {
      const { rows } = await pool.query(
        "INSERT INTO conversations (id,participant1_id,participant2_id,ad_id,created_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING *",
        [uuidv4(), req.userId, userId, adId||null]
      );
      conv = rows[0];
    }

    if (msgText) {
      await pool.query(
        "INSERT INTO messages (id,conversation_id,sender_id,text,created_at) VALUES ($1,$2,$3,$4,NOW())",
        [uuidv4(), conv.id, req.userId, msgText]
      );
      await pool.query(
        "UPDATE conversations SET last_message=$1, last_message_at=NOW(), updated_at=NOW(), unread2=unread2+1 WHERE id=$2",
        [msgText, conv.id]
      );
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
    const { rows } = await pool.query(
      "SELECT participant1_id, unread1, unread2 FROM conversations WHERE participant1_id=$1 OR participant2_id=$1",
      [myId]
    );
    let total = 0;
    rows.forEach(c => { total += c.participant1_id === myId ? (c.unread1||0) : (c.unread2||0); });
    res.json({ count: total, unread: total });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
