/**
 * db.js — Database abstraction layer
 * Supports both JSON file storage (default) and Supabase (when configured)
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");

// Try to load Supabase if credentials exist
let supabase = null;
let useSupabase = false;

try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.DATABASE_URL) {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL.trim();
    const supabaseKey = process.env.SUPABASE_ANON_KEY.trim();
    
    if (supabaseUrl.startsWith('https://')) {
      supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      useSupabase = true;
      console.log('✅ Supabase mode ENABLED');
    } else {
      console.warn('⚠️ SUPABASE_URL invalid, using JSON mode');
    }
  } else {
    console.log('📁 Using JSON file storage mode');
  }
} catch (err) {
  console.warn('⚠️ Supabase not available:', err.message);
  console.log('📁 Falling back to JSON file storage');
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Failed to load data.json, starting fresh:", e.message);
  }
  return {
    users: [],
    ads: [],
    reels: [],
    conversations: [],
    messages: [],
    savedAds: [],
    adLikes: [],
    adComments: [],
    reelLikes: [],
    reelComments: [],
    adminCode: "dealsara2024",
  };
}

function saveData() {
  if (useSupabase) return; // Don't save JSON when using Supabase
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    // Silently continue
  }
}

const db = loadData();

// Seed demo data only in JSON mode and if empty
if (!useSupabase && db.ads.length === 0) {
  const { v4: uuidv4 } = require("uuid");
  const bcrypt = require("bcryptjs");
  const salt = bcrypt.genSaltSync(10);

  const demoUser = {
    id: uuidv4(),
    name: "Demo User",
    email: "demo@dealsara.com",
    password: bcrypt.hashSync("demo1234", salt),
    avatar: null,
    bio: "Buying and selling on DealSara!",
    location: "Mumbai",
    phone: "",
    verified: true,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    followers: 0,
    following: 0,
    rating: 4.8,
    totalSales: 12,
  };

  const adminUser = {
    id: uuidv4(),
    name: "Admin",
    email: "admin@dealsara.com",
    password: bcrypt.hashSync("admin2024", salt),
    avatar: null,
    bio: "DealSara Admin",
    location: "Delhi",
    phone: "",
    verified: true,
    isAdmin: true,
    createdAt: new Date().toISOString(),
    followers: 0,
    following: 0,
    rating: 5.0,
    totalSales: 0,
  };

  db.users.push(demoUser, adminUser);

  const categories = ["Electronics", "Furniture", "Clothing", "Books", "Vehicles", "Sports", "Home & Garden", "Toys"];

  for (let i = 0; i < 20; i++) {
    const cat = categories[i % categories.length];
    db.ads.push({
      id: uuidv4(),
      userId: demoUser.id,
      title: `${cat} Item ${i + 1}`,
      description: `Great condition ${cat.toLowerCase()} item. Well maintained, no issues. Selling because upgrading.`,
      price: Math.floor(Math.random() * 50000) + 500,
      category: cat,
      condition: ["New", "Like New", "Good", "Fair"][i % 4],
      location: ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad"][i % 5],
      images: [],
      isFeatured: i < 3,
      isPromoted: i < 5,
      views: Math.floor(Math.random() * 500),
      likes: Math.floor(Math.random() * 50),
      saves: Math.floor(Math.random() * 20),
      status: "active",
      createdAt: new Date(Date.now() - i * 3600000 * 24).toISOString(),
      user: {
        id: demoUser.id,
        name: demoUser.name,
        avatar: null,
        rating: demoUser.rating,
        verified: demoUser.verified,
      },
    });
  }

  for (let i = 0; i < 10; i++) {
    db.reels.push({
      id: uuidv4(),
      userId: demoUser.id,
      title: `Reel #${i + 1}`,
      description: `Check out this amazing deal! #deals #dealsara`,
      videoUrl: null,
      thumbnail: null,
      adId: db.ads[i]?.id || null,
      likes: Math.floor(Math.random() * 200),
      views: Math.floor(Math.random() * 2000),
      comments: Math.floor(Math.random() * 30),
      createdAt: new Date(Date.now() - i * 7200000).toISOString(),
      user: {
        id: demoUser.id,
        name: demoUser.name,
        avatar: null,
        verified: demoUser.verified,
      },
    });
  }

  saveData();
}

module.exports = { db, saveData, supabase, useSupabase };
