const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { paymentLimiter } = require("../middleware/rateLimiter");
const v = require("../models/validators");
const {
  getPriceSummary, applyCoupon,
  createPaymentIntent, confirmPayment, verifyPayment,
  getPaymentByBooking, handleWebhook,
} = require("../controllers/paymentController");

// Stripe webhook — raw body, no auth, no rate limit
router.post("/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => { req.rawBody = req.body; next(); },
  handleWebhook
);

router.get ("/summary/:bookingId",      verifyToken,                                                       getPriceSummary);
router.post("/apply-coupon",            verifyToken, paymentLimiter, validate(v.applyCouponSchema),        applyCoupon);
router.post("/create-intent",           verifyToken, paymentLimiter, validate(v.createPaymentIntentSchema),createPaymentIntent);
router.post("/confirm",                 verifyToken, paymentLimiter, validate(v.confirmPaymentSchema),     confirmPayment);
router.post("/verify",                  verifyToken, validate(v.verifyPaymentSchema),                      verifyPayment);
router.get ("/booking/:bookingId",      verifyToken,                                                       getPaymentByBooking);

module.exports = router;
