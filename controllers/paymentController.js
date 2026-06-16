const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

const PLATFORM_FEE = 5;
const TAX_RATE = 0.05;
const PAW_POINTS_RATE = 1; // 1 PawPoint per dollar of total paid

// ─── Calculate price breakdown (shared helper) ────────────────────────────────
async function buildPriceSummary(booking, couponCode) {
  const servicePrice = booking.service ? Number(booking.service.price) : Number(booking.vet?.consultationFee || 0);
  const platformFee = PLATFORM_FEE;
  const subtotal = servicePrice;

  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
    });

    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
      if (!coupon.maxUses || coupon.usedCount < coupon.maxUses) {
        discount = coupon.isPercent
          ? parseFloat(((subtotal * Number(coupon.discount)) / 100).toFixed(2))
          : Number(coupon.discount);
        appliedCoupon = coupon;
      }
    }
  }

  const taxableAmount = subtotal - discount + platformFee;
  const taxAmount = parseFloat((taxableAmount * TAX_RATE).toFixed(2));
  const total = parseFloat((taxableAmount + taxAmount).toFixed(2));
  const pawPoints = Math.floor(total * PAW_POINTS_RATE);

  return { subtotal, platformFee, taxAmount, discount, total, pawPoints, appliedCoupon };
}

// ─── GET /api/payments/summary/:bookingId?coupon=CODE ─────────────────────────
// Screen 6: Price Summary — service cost + platform fee + 5% tax - discount
exports.getPriceSummary = asyncHandler(async (req, res) => {
  const { coupon } = req.query;

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.bookingId },
    include: {
      service: { select: { name: true, price: true } },
      vet: { select: { name: true, consultationFee: true } },
    },
  });

  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id) return res.status(403).json({ success: false, message: "Access denied" });

  const summary = await buildPriceSummary(booking, coupon);

  res.json({
    success: true,
    data: {
      serviceName: booking.service?.name || "Consultation",
      servicePrice: summary.subtotal,
      platformFee: summary.platformFee,
      tax: summary.taxAmount,
      taxRate: `${TAX_RATE * 100}%`,
      discount: summary.discount,
      coupon: summary.appliedCoupon ? { code: summary.appliedCoupon.code, discount: summary.discount } : null,
      total: summary.total,
      pawPoints: summary.pawPoints,
    },
  });
});

// ─── POST /api/payments/apply-coupon ─────────────────────────────────────────
// Validate a coupon code and return discount info
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

  if (!coupon || !coupon.isActive) {
    return res.status(400).json({ success: false, message: "Invalid coupon code" });
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return res.status(400).json({ success: false, message: "This coupon has expired" });
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return res.status(400).json({ success: false, message: "This coupon has reached its usage limit" });
  }

  const summary = await buildPriceSummary(booking, code);

  res.json({
    success: true,
    message: "Coupon applied successfully",
    data: {
      code: coupon.code,
      discount: summary.discount,
      newTotal: summary.total,
      pawPoints: summary.pawPoints,
    },
  });
});

// ─── POST /api/payments/confirm ───────────────────────────────────────────────
// Screen 8: User selects payment method → CONFIRM → booking goes to "confirmed"
// paymentMethod: "card" | "upi" | "wallet" | "net_banking"
exports.confirmPayment = asyncHandler(async (req, res) => {
  const { bookingId, paymentMethod, couponCode } = req.body;
  const VALID_METHODS = ["card", "upi", "wallet", "net_banking"];

  if (!bookingId || !paymentMethod) {
    return res.status(400).json({ success: false, message: "bookingId and paymentMethod are required" });
  }
  if (!VALID_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: `paymentMethod must be one of: ${VALID_METHODS.join(", ")}` });
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

  // Increment coupon usage if applied
  if (summary.appliedCoupon) {
    await prisma.coupon.update({
      where: { id: summary.appliedCoupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  // Create or update payment record
  const payment = await prisma.payment.upsert({
    where: { bookingId },
    update: {
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: summary.appliedCoupon?.code || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod,
      paymentStatus: "paid",
      paidAt: new Date(),
    },
    create: {
      bookingId,
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: summary.appliedCoupon?.code || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod,
      paymentStatus: "paid",
      paidAt: new Date(),
    },
  });

  // Confirm the booking
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
    message: "Payment confirmed! Booking is now confirmed.",
    data: {
      booking: {
        ...updatedBooking,
        appointmentId: `APT${updatedBooking.id.replace(/-/g, "").toUpperCase().slice(0, 10)}`,
        dateTimeFormatted: formatDateTime(updatedBooking.bookingDate, updatedBooking.bookingTime),
      },
      payment: {
        id: payment.id,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        paymentStatus: payment.paymentStatus,
        pawPoints: payment.pawPoints,
        paidAt: payment.paidAt,
      },
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

// ─── Stripe webhook (kept for optional Stripe integration) ────────────────────
exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.json({ received: true });
  }

  let event;
  try {
    const Stripe = require("stripe");
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      await prisma.payment.updateMany({
        where: { transactionId: session.id },
        data: { paymentStatus: "paid", paidAt: new Date() },
      });
      await prisma.booking.update({ where: { id: bookingId }, data: { status: "confirmed" } });
    }
  }

  res.json({ received: true });
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDateTime(date, time) {
  const d = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}
