const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
  getPriceSummary,
  applyCoupon,
  createPaymentIntent,
  confirmPayment,
  verifyPayment,
  getPaymentByBooking,
  handleWebhook,
} = require("../controllers/paymentController");

// ─── Stripe webhook — MUST receive raw body, no auth ─────────────────────────
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => { req.rawBody = req.body; next(); },
  handleWebhook
);

// ─── Price summary — Screen 6 ─────────────────────────────────────────────────
router.get("/summary/:bookingId", verifyToken, getPriceSummary);

// ─── Coupon validation ────────────────────────────────────────────────────────
router.post("/apply-coupon", verifyToken, applyCoupon);

// ─── Stripe: Card / Net Banking — returns clientSecret for flutter_stripe ─────
router.post("/create-intent", verifyToken, createPaymentIntent);

// ─── Wallet — direct confirmation, no Stripe ─────────────────────────────────
router.post("/confirm", verifyToken, confirmPayment);

// ─── Verify after Stripe payment sheet closes ─────────────────────────────────
router.post("/verify", verifyToken, verifyPayment);

// ─── Get payment details ──────────────────────────────────────────────────────
router.get("/booking/:bookingId", verifyToken, getPaymentByBooking);

module.exports = router;
