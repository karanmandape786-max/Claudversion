require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// ── FIXED CORS CONFIGURATION ─────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://claudversion.vercel.app",
  "https://claudversion-git-main-karan-s-projects.vercel.app",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

console.log("📡 CORS Allowed Origins:", allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow any vercel.app subdomain (for preview deployments)
    if (origin.endsWith(".vercel.app")) {
      return callback(null, true);
    }
    
    // Allow localhost in development
    if (process.env.NODE_ENV !== "production" && 
        (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
      return callback(null, true);
    }
    
    console.log(`❌ CORS blocked: ${origin}`);
    callback(new Error(`CORS policy: ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
}));

// Handle preflight requests for all routes
app.options("*", cors());

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
  res.json({ 
    status: "ok", 
    message: "DealSara API 🚀", 
    version: "2.0.0", 
    timestamp: new Date().toISOString(),
    cors: "enabled"
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    uptime: Math.round(process.uptime()) + "s",
    cors: "enabled"
  });
});

// ── Test CORS endpoint ────────────────────────────────────────────────────────
app.get("/api/test-cors", (req, res) => {
  res.json({ 
    message: "CORS is working correctly!", 
    origin: req.headers.origin || "no origin",
    timestamp: new Date().toISOString()
  });
});

// ── 404 / Error ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.url}` });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack || err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ DealSara backend on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || "not set"}`);
});
