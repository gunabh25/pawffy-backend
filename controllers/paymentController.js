const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

const PLATFORM_FEE = 5;
const TAX_RATE = 0.05;
const PAW_POINTS_RATE = 1; // 1 PawPoint per dollar paid

// ─── Stripe helper ────────────────────────────────────────────────────────────
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw Object.assign(new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to .env"), { status: 503 });
  }
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

// ─── Price calculation (shared) ───────────────────────────────────────────────
async function buildPriceSummary(booking, couponCode) {
  const servicePrice = booking.service
    ? Number(booking.service.price)
    : Number(booking.vet?.consultationFee || 0);

  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
    });
    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
      if (!coupon.maxUses || coupon.usedCount < coupon.maxUses) {
        discount = coupon.isPercent
          ? parseFloat(((servicePrice * Number(coupon.discount)) / 100).toFixed(2))
          : Number(coupon.discount);
        appliedCoupon = coupon;
      }
    }
  }

  const taxableAmount = servicePrice - discount + PLATFORM_FEE;
  const taxAmount = parseFloat((taxableAmount * TAX_RATE).toFixed(2));
  const total = parseFloat((taxableAmount + taxAmount).toFixed(2));
  const pawPoints = Math.floor(total * PAW_POINTS_RATE);

  return { subtotal: servicePrice, platformFee: PLATFORM_FEE, taxAmount, discount, total, pawPoints, appliedCoupon };
}

// ─── GET /api/payments/summary/:bookingId?coupon=CODE ─────────────────────────
// Screen 6: Price Summary
exports.getPriceSummary = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.bookingId },
    include: {
      service: { select: { name: true, price: true } },
      vet: { select: { name: true, consultationFee: true } },
    },
  });

  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });

  const summary = await buildPriceSummary(booking, req.query.coupon);

  res.json({
    success: true,
    data: {
      serviceName: booking.service?.name || "Consultation",
      servicePrice: summary.subtotal,
      platformFee: summary.platformFee,
      tax: summary.taxAmount,
      taxRate: `${TAX_RATE * 100}%`,
      discount: summary.discount,
      coupon: summary.appliedCoupon
        ? { code: summary.appliedCoupon.code, discount: summary.discount }
        : null,
      total: summary.total,
      pawPoints: summary.pawPoints,
    },
  });
});

// ─── POST /api/payments/apply-coupon ─────────────────────────────────────────
exports.applyCoupon = asyncHandler(async (req, res) => {
  const { code, bookingId } = req.body;
  if (!code || !bookingId) {
    return res.status(400).json({ success: false, message: "code and bookingId are required" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: true, vet: true },
  });
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });

  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) return res.status(400).json({ success: false, message: "Invalid coupon code" });
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return res.status(400).json({ success: false, message: "Coupon has expired" });
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ success: false, message: "Coupon usage limit reached" });

  const summary = await buildPriceSummary(booking, code);

  res.json({
    success: true,
    message: "Coupon applied",
    data: { code: coupon.code, discount: summary.discount, newTotal: summary.total, pawPoints: summary.pawPoints },
  });
});

// ─── POST /api/payments/create-intent ─────────────────────────────────────────
// Screen 8 (Card / Net Banking) — Creates Stripe PaymentIntent → returns clientSecret
// Flutter uses clientSecret with flutter_stripe to present native payment sheet
//
// paymentMethod: "card" | "net_banking"
exports.createPaymentIntent = asyncHandler(async (req, res) => {
  const { bookingId, paymentMethod, couponCode } = req.body;
  const STRIPE_METHODS = ["card", "net_banking"];

  if (!bookingId || !paymentMethod) {
    return res.status(400).json({ success: false, message: "bookingId and paymentMethod are required" });
  }
  if (!STRIPE_METHODS.includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: `create-intent is for card and net_banking only. Use /confirm for wallet.`,
    });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true, price: true } },
      vet: { select: { name: true, consultationFee: true } },
      payment: true,
    },
  });

  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });
  if (booking.payment?.paymentStatus === "paid") {
    return res.status(409).json({ success: false, message: "This booking has already been paid" });
  }

  const summary = await buildPriceSummary(booking, couponCode);
  const amountInPaise = Math.round(summary.total * 100); // Stripe uses smallest currency unit

  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPaise,
    currency: "inr",
    payment_method_types: paymentMethod === "net_banking" ? ["netbanking"] : ["card"],
    metadata: {
      bookingId,
      userId: req.user.id,
      couponCode: couponCode || "",
      paymentMethod,
    },
    description: `Pawffy booking – ${booking.service?.name || "Consultation"}`,
  });

  // Save a pending payment record
  await prisma.payment.upsert({
    where: { bookingId },
    update: {
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: couponCode || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod,
      paymentStatus: "pending",
      transactionId: paymentIntent.id,
    },
    create: {
      bookingId,
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: couponCode || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod,
      paymentStatus: "pending",
      transactionId: paymentIntent.id,
    },
  });

  // Increment coupon usage early (reserve it)
  if (summary.appliedCoupon) {
    await prisma.coupon.update({
      where: { id: summary.appliedCoupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  res.json({
    success: true,
    data: {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: summary.total,
      amountInPaise,
      currency: "inr",
      summary: {
        serviceName: booking.service?.name || "Consultation",
        servicePrice: summary.subtotal,
        platformFee: summary.platformFee,
        tax: summary.taxAmount,
        discount: summary.discount,
        total: summary.total,
        pawPoints: summary.pawPoints,
      },
    },
  });
});

// ─── POST /api/payments/confirm ───────────────────────────────────────────────
// Screen 8 (Wallet) — Direct payment without Stripe, confirms immediately
// paymentMethod: "wallet"
exports.confirmPayment = asyncHandler(async (req, res) => {
  const { bookingId, couponCode } = req.body;

  if (!bookingId) {
    return res.status(400).json({ success: false, message: "bookingId is required" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true, price: true } },
      vet: { select: { name: true, consultationFee: true } },
      payment: true,
    },
  });

  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });
  if (booking.payment?.paymentStatus === "paid") {
    return res.status(409).json({ success: false, message: "This booking has already been paid" });
  }

  const summary = await buildPriceSummary(booking, couponCode);

  if (summary.appliedCoupon) {
    await prisma.coupon.update({
      where: { id: summary.appliedCoupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  const payment = await prisma.payment.upsert({
    where: { bookingId },
    update: {
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: couponCode || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod: "wallet",
      paymentStatus: "paid",
      paidAt: new Date(),
    },
    create: {
      bookingId,
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: couponCode || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod: "wallet",
      paymentStatus: "paid",
      paidAt: new Date(),
    },
  });

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "confirmed" },
    include: {
      pet: { select: { id: true, name: true, breed: true } },
      vet: { select: { id: true, name: true, clinicName: true, clinicAddress: true, clinicCity: true } },
      service: { select: { name: true, price: true } },
    },
  });

  res.json({
    success: true,
    message: "Wallet payment confirmed! Booking is now confirmed.",
    data: {
      booking: {
        ...updatedBooking,
        appointmentId: `APT${updatedBooking.id.replace(/-/g, "").toUpperCase().slice(0, 10)}`,
        dateTimeFormatted: formatDateTime(updatedBooking.bookingDate, updatedBooking.bookingTime),
      },
      payment: {
        id: payment.id,
        amount: payment.amount,
        paymentMethod: "wallet",
        paymentStatus: "paid",
        pawPoints: payment.pawPoints,
        paidAt: payment.paidAt,
      },
    },
  });
});

// ─── POST /api/payments/verify ────────────────────────────────────────────────
// Flutter calls this after Stripe payment sheet closes to check if payment succeeded
// (in case webhook hasn't fired yet — polled once or twice)
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) {
    return res.status(400).json({ success: false, message: "paymentIntentId is required" });
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  const payment = await prisma.payment.findFirst({
    where: { transactionId: paymentIntentId },
    include: {
      booking: {
        select: {
          id: true, status: true, bookingDate: true, bookingTime: true,
          pet: { select: { name: true } },
          vet: { select: { name: true } },
        },
      },
    },
  });

  if (!payment) return res.status(404).json({ success: false, message: "Payment record not found" });

  // If Stripe says succeeded but our DB isn't updated yet, sync it
  if (intent.status === "succeeded" && payment.paymentStatus !== "paid") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: "confirmed" },
    });
    payment.paymentStatus = "paid";
  }

  res.json({
    success: true,
    data: {
      stripeStatus: intent.status,
      paymentStatus: payment.paymentStatus,
      bookingStatus: payment.booking?.status,
      bookingId: payment.bookingId,
      appointmentId: `APT${payment.bookingId.replace(/-/g, "").toUpperCase().slice(0, 10)}`,
    },
  });
});

// ─── GET /api/payments/booking/:bookingId ─────────────────────────────────────
exports.getPaymentByBooking = asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { bookingId: req.params.bookingId },
    include: {
      booking: {
        select: {
          bookingType: true, bookingDate: true, bookingTime: true, status: true,
          pet: { select: { name: true, species: true } },
          vet: { select: { name: true, clinicName: true } },
          service: { select: { name: true } },
        },
      },
    },
  });

  if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
  res.json({ success: true, data: payment });
});

// ─── POST /api/payments/webhook — Stripe webhook ──────────────────────────────
// Stripe calls this automatically when payment_intent.succeeded fires
// Set this URL in Stripe Dashboard → Webhooks: https://your-domain.com/api/payments/webhook
exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.json({ received: true }); // Stripe not configured — skip
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const bookingId = intent.metadata?.bookingId;

    if (bookingId) {
      await prisma.payment.updateMany({
        where: { transactionId: intent.id },
        data: { paymentStatus: "paid", paidAt: new Date() },
      });
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "confirmed" },
      });
      console.log(`✅ Stripe webhook: booking ${bookingId} confirmed`);
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    await prisma.payment.updateMany({
      where: { transactionId: intent.id },
      data: { paymentStatus: "failed" },
    });
    console.log(`❌ Stripe webhook: payment failed for intent ${intent.id}`);
  }

  res.json({ received: true });
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDateTime(date, time) {
  const d = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}
