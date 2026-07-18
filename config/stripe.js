const AppError = require("../middleware/errors");

let stripeClient = null;

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new AppError("Stripe is not configured. Add STRIPE_SECRET_KEY to .env", 503);
  }

  if (!stripeClient) {
    stripeClient = require("stripe")(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

function getStripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function getStripeCurrency() {
  return (process.env.STRIPE_CURRENCY || "inr").toLowerCase();
}

// Where Stripe redirects the vendor back to after (or when abandoning) Express
// onboarding. Falls back to a FRONTEND_URL-based path for local/dev.
function getConnectReturnUrl() {
  if (process.env.STRIPE_CONNECT_RETURN_URL) return process.env.STRIPE_CONNECT_RETURN_URL;
  const base = process.env.FRONTEND_URL || "http://localhost:5001";
  return `${base.replace(/\/$/, "")}/vendor/payouts/return`;
}

function getConnectRefreshUrl() {
  if (process.env.STRIPE_CONNECT_REFRESH_URL) return process.env.STRIPE_CONNECT_REFRESH_URL;
  const base = process.env.FRONTEND_URL || "http://localhost:5001";
  return `${base.replace(/\/$/, "")}/vendor/payouts/refresh`;
}

module.exports = {
  getStripe,
  getStripePublishableKey,
  isStripeConfigured,
  getStripeCurrency,
  getConnectReturnUrl,
  getConnectRefreshUrl,
};
