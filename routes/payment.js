const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { paymentLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  getPaymentConfig, getPriceSummary, applyCoupon,
  createPaymentIntent, confirmPayment, verifyPayment,
  getPaymentByBooking, handleWebhook,
} = require("../controllers/paymentController");

// Body is a Buffer from express.raw() mounted in server.js before json parser
router.post("/webhook", (req, res, next) => {
  req.rawBody = req.body;
  next();
}, handleWebhook);

router.get("/config", verifyToken, getPaymentConfig);
router.get ("/summary/:bookingId", verifyToken, validateUuidParams("bookingId"), getPriceSummary);
router.post("/apply-coupon",       verifyToken, paymentLimiter, validate(v.applyCouponSchema), applyCoupon);
router.post("/create-intent",      verifyToken, paymentLimiter, validate(v.createPaymentIntentSchema), createPaymentIntent);
router.post("/confirm",            verifyToken, paymentLimiter, validate(v.confirmPaymentSchema), confirmPayment);
router.post("/verify",             verifyToken, paymentLimiter, validate(v.verifyPaymentSchema), verifyPayment);
router.get ("/booking/:bookingId", verifyToken, validateUuidParams("bookingId"), getPaymentByBooking);

module.exports = router;
