const { createClient } = require("@supabase/supabase-js");
const AppError = require("../middleware/errors");

let adminClient = null;

function getSupabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || null;
}

function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = getSupabaseServiceKey();

  if (!url || !serviceRoleKey) {
    throw new AppError("Supabase is not configured on the server", 500);
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

module.exports = { getSupabaseAdmin };
