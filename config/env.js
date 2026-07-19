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

  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !process.env.FRONTEND_URL) {
    console.error("FRONTEND_URL is required in production for CORS");
    process.exit(1);
  }

  const supabaseUrlMissing = !process.env.SUPABASE_URL;
  const supabaseKeyMissing = !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY;

  if (isProd && (supabaseUrlMissing || supabaseKeyMissing)) {
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

  const stripeEnabled = Boolean(process.env.STRIPE_SECRET_KEY) || process.env.WALLET_PAYMENTS_ENABLED === "true";

  if (isProd && stripeEnabled) {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required when payments are enabled in production");
      process.exit(1);
    }
  } else if (isProd) {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.warn("Warning: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET should be set in production");
    }
  } else if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("Warning: STRIPE_SECRET_KEY not set — card/net banking payments disabled");
  }

  if (isProd && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_PUBLISHABLE_KEY) {
    console.warn("Warning: STRIPE_PUBLISHABLE_KEY is not set — mobile Stripe SDK cannot initialize");
  }
}

module.exports = { validateEnv };
