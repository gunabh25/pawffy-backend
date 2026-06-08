const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const verifyToken = require("../middleware/verifyToken");
const { createCheckoutSession, handleWebhook, getPaymentByBooking } = require("../controllers/paymentController");

router.post("/checkout", verifyToken, createCheckoutSession);
router.post("/webhook", bodyParser.raw({ type: "application/json" }), handleWebhook);
router.get("/booking/:bookingId", verifyToken, getPaymentByBooking);

module.exports = router;
