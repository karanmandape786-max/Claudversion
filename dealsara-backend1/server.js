require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      process.env.FRONTEND_URL,
      "http://localhost:3000",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
    ].filter(Boolean);
    if (allowed.includes(origin) || origin.endsWith(".vercel.app")) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== "production") return callback(null, true);
    callback(new Error("CORS: not allowed — " + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",        require("./routes/auth"));
app.use("/api/ads",         require("./routes/ads"));
app.use("/api/reels",       require("./routes/reels"));
app.use("/api/chat",        require("./routes/chat"));
app.use("/api/users",       require("./routes/users"));
app.use("/api/admin",       require("./routes/admin"));
app.use("/api/competition", require("./routes/competition"));

// ── Health / root ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "DealSara API 🚀", version: "2.0.0", timestamp: new Date().toISOString() });
});
app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: Math.round(process.uptime()) + "s" });
});

// ── 404 / Error ───────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack || err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

app.listen(PORT, () => console.log(`✅ DealSara backend on port ${PORT}`));
