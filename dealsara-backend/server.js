require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS CONFIGURATION ─────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://claudversion.vercel.app",
  "https://claudversion.onrender.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin && origin.endsWith(".vercel.app")) return callback(null, true);
    if (origin && origin.endsWith(".onrender.com")) return callback(null, true);
    if (process.env.NODE_ENV !== "production" && 
        (origin?.includes("localhost") || origin?.includes("127.0.0.1"))) {
      return callback(null, true);
    }
    console.log(`❌ CORS blocked: ${origin}`);
    callback(new Error(`CORS policy: ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}));

app.options("*", cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── HEALTH ROUTES (MUST BE BEFORE OTHER ROUTES) ────────────────────────────
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    uptime: process.uptime(), 
    timestamp: new Date().toISOString() 
  });
});

app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "DealSara API 🚀", 
    version: "2.0.0", 
    timestamp: new Date().toISOString(),
    cors: "enabled",
    endpoints: {
      health: "/health",
      ads: "/api/ads",
      auth: "/api/auth",
      reels: "/api/reels",
      users: "/api/users"
    }
  });
});

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.use("/api/auth",        require("./routes/auth"));
app.use("/api/ads",         require("./routes/ads"));
app.use("/api/reels",       require("./routes/reels"));
app.use("/api/chat",        require("./routes/chat"));
app.use("/api/users",       require("./routes/users"));
app.use("/api/admin",       require("./routes/admin"));
app.use("/api/competition", require("./routes/competition"));

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ 
    message: `Route not found: ${req.method} ${req.url}`,
    availableEndpoints: ["/", "/health", "/api/auth", "/api/ads", "/api/reels", "/api/users"]
  });
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Error:", err.stack || err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ DealSara backend on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
});
