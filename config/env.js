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
}

module.exports = { validateEnv };
