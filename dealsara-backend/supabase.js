// supabase.js
const { createClient } = require('@supabase/supabase-js');

// Validate and clean environment variables
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not set in environment variables');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ SUPABASE_ANON_KEY is not set in environment variables');
  process.exit(1);
}

// Ensure URL has proper format
if (!supabaseUrl.startsWith('https://')) {
  console.error('❌ SUPABASE_URL must start with https://. Current value:', supabaseUrl);
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log('✅ Supabase client initialized with URL:', supabaseUrl);

module.exports = { supabase };
