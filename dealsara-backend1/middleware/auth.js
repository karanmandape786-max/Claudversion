const jwt = require("jsonwebtoken");
const supabase = require("../supabase");

const JWT_SECRET = process.env.JWT_SECRET || "dealsara_secret_change_in_prod_456789";

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    req.userIsAdmin = decoded.isAdmin || false;
    // Attach minimal user object — routes that need full user should query Supabase
    req.user = { id: decoded.id, email: decoded.email, isAdmin: decoded.isAdmin || false };
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    req.userIsAdmin = decoded.isAdmin || false;
    req.user = { id: decoded.id, email: decoded.email, isAdmin: decoded.isAdmin || false };
  } catch {
    req.user = null;
  }
  next();
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (!req.userIsAdmin)
      return res.status(403).json({ message: "Admin access required" });
    next();
  });
}

module.exports = { auth, optionalAuth, adminAuth, JWT_SECRET };
