const { JWT_MIN_SECRET_LENGTH } = require("../constants/security");

function validateEnv() {
  const required = ["JWT_SECRET", "DATABASE_URL"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < JWT_MIN_SECRET_LENGTH) {
    const message = `JWT_SECRET must be at least ${JWT_MIN_SECRET_LENGTH} characters`;
    if (process.env.NODE_ENV === "production") {
      console.error(message);
      process.exit(1);
    }
    console.warn(`Warning: ${message}`);
  }

  if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL) {
    console.warn("Warning: FRONTEND_URL is not set — CORS will only allow localhost origins");
  }

  const supabaseUrlMissing = !process.env.SUPABASE_URL;
  const supabaseKeyMissing = !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY;

  if (process.env.NODE_ENV === "production" && (supabaseUrlMissing || supabaseKeyMissing)) {
    console.error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required in production");
    process.exit(1);
  }

  if (supabaseUrlMissing || supabaseKeyMissing) {
    const missingSupabase = [
      ...(supabaseUrlMissing ? ["SUPABASE_URL"] : []),
      ...(supabaseKeyMissing ? ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"] : []),
    ];
    console.warn(
      `Warning: ${missingSupabase.join(", ")} not set — auth session endpoints will return 500`
    );
  }
}

module.exports = { validateEnv };
