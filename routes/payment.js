const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const verifyToken = require("../middleware/verifyToken");
const {
  getPriceSummary,
  applyCoupon,
  confirmPayment,
  getPaymentByBooking,
  handleWebhook,
} = require("../controllers/paymentController");

// Stripe webhook — needs raw body
router.post("/webhook", bodyParser.raw({ type: "application/json" }), handleWebhook);

// Price summary — Screen 6
router.get("/summary/:bookingId", verifyToken, getPriceSummary);

// Apply coupon code
router.post("/apply-coupon", verifyToken, applyCoupon);

// Confirm payment — Screen 8 (PAY button)
router.post("/confirm", verifyToken, confirmPayment);

// Get payment details by booking
router.get("/booking/:bookingId", verifyToken, getPaymentByBooking);

module.exports = router;
