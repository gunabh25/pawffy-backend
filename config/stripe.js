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

module.exports = {
  getStripe,
  getStripePublishableKey,
  isStripeConfigured,
  getStripeCurrency,
};
