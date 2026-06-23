const asyncHandler = require("../middleware/asyncHandler");
const paymentService = require("../services/payment.service");

exports.getPriceSummary = asyncHandler(async (req, res) => {
  const data = await paymentService.getPriceSummary(
    req.user.id,
    req.params.bookingId,
    req.query.coupon
  );
  res.json({ success: true, data });
});

exports.applyCoupon = asyncHandler(async (req, res) => {
  const data = await paymentService.applyCoupon(req.user.id, req.body.bookingId, req.body.code);
  res.json({ success: true, message: "Coupon applied", data });
});

exports.createPaymentIntent = asyncHandler(async (req, res) => {
  const data = await paymentService.createPaymentIntent(req.user.id, req.body);
  res.json({ success: true, data });
});

exports.confirmPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.confirmWalletPayment(req.user.id, req.body);
  res.json({
    success: true,
    message: "Wallet payment confirmed! Booking is now confirmed.",
    data,
  });
});

exports.verifyPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.verifyPayment(req.body.paymentIntentId);
  res.json({ success: true, data });
});

exports.getPaymentByBooking = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPaymentByBooking(req, req.params.bookingId);
  res.json({ success: true, data: payment });
});

exports.handleWebhook = async (req, res, next) => {
  try {
    const result = await paymentService.handleStripeWebhook(
      req.rawBody || req.body,
      req.headers["stripe-signature"]
    );
    res.json(result);
  } catch (err) {
    if (err.message?.includes("Webhook")) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    next(err);
  }
};
