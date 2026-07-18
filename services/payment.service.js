const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { PLATFORM_FEE, TAX_RATE, PAW_POINTS_RATE } = require("../constants/pricing");
const { assertOwnerOrAdmin } = require("../utils/petAccess");
const { formatDateTime, formatAppointmentId } = require("../utils/formatters");
const {
  getStripe,
  getStripePublishableKey,
  isStripeConfigured,
  getStripeCurrency,
} = require("../config/stripe");

async function redeemCouponIfNeeded(tx, couponCode) {
  if (!couponCode) return;
  const coupon = await tx.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
  if (!coupon) return;
  await tx.coupon.update({
    where: { id: coupon.id },
    data: { usedCount: { increment: 1 } },
  });
}

async function finalizeBookingPayment(bookingId, transactionId, chargeId = null) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { bookingId, transactionId },
    });
    if (!payment || payment.paymentStatus === "paid") return false;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        paymentStatus: "paid",
        paidAt: new Date(),
        ...(chargeId ? { chargeId } : {}),
      },
    });

    await redeemCouponIfNeeded(tx, payment.couponCode);

    await tx.partnerBooking.update({
      where: { id: bookingId },
      data: { status: "confirmed" },
    });

    return true;
  });
}

function getPaymentConfig() {
  if (!isStripeConfigured()) {
    throw new AppError("Stripe is not configured on the server", 503);
  }

  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    throw new AppError("STRIPE_PUBLISHABLE_KEY is not configured", 503);
  }

  return {
    publishableKey,
    currency: getStripeCurrency(),
    paymentMethods: ["card", "net_banking"],
  };
}

async function buildPriceSummary(booking, couponCode) {
  const servicePrice = Number(booking.price || 0);

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

async function getBookingForUser(userId, bookingId, include = {}) {
  const booking = await prisma.partnerBooking.findUnique({
    where: { id: bookingId },
    include,
  });

  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.customerId !== userId) throw new AppError("Access denied", 403);
  return booking;
}

async function getPriceSummary(userId, bookingId, couponCode) {
  const booking = await getBookingForUser(userId, bookingId);

  const summary = await buildPriceSummary(booking, couponCode);

  return {
    serviceName: booking.serviceName || "Service",
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
  };
}

async function applyCoupon(userId, bookingId, code) {
  const booking = await getBookingForUser(userId, bookingId);

  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) throw new AppError("Invalid coupon code", 400);
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError("Coupon has expired", 400);
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    throw new AppError("Coupon usage limit reached", 400);
  }

  const summary = await buildPriceSummary(booking, code);

  return {
    code: coupon.code,
    discount: summary.discount,
    newTotal: summary.total,
    pawPoints: summary.pawPoints,
  };
}

async function createPaymentIntent(userId, { bookingId, paymentMethod, couponCode }) {
  const booking = await getBookingForUser(userId, bookingId, {
    payment: true,
    business: { select: { payoutsEnabled: true, stripeAccountId: true } },
  });

  if (booking.payment?.paymentStatus === "paid") {
    throw new AppError("This booking has already been paid", 409);
  }

  if (!booking.business?.payoutsEnabled) {
    throw new AppError("Vendor is not set up to receive payments yet", 409);
  }

  const summary = await buildPriceSummary(booking, couponCode);
  const vendorAmount = parseFloat((summary.subtotal - summary.discount).toFixed(2));
  const currency = getStripeCurrency();
  const amountMinor = Math.round(summary.total * 100);
  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountMinor,
    currency,
    payment_method_types: paymentMethod === "net_banking" ? ["netbanking"] : ["card"],
    transfer_group: bookingId,
    metadata: {
      type: "booking",
      bookingId,
      userId,
      couponCode: couponCode || "",
      paymentMethod,
    },
    description: `Pawffy booking – ${booking.serviceName || "Service"}`,
  });

  await prisma.payment.upsert({
    where: { bookingId },
    update: {
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: couponCode || null,
      amount: summary.total,
      vendorAmount,
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
      vendorAmount,
      pawPoints: summary.pawPoints,
      paymentMethod,
      paymentStatus: "pending",
      transactionId: paymentIntent.id,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: summary.total,
    amountMinor,
    currency,
    summary: {
      serviceName: booking.serviceName || "Service",
      servicePrice: summary.subtotal,
      platformFee: summary.platformFee,
      tax: summary.taxAmount,
      discount: summary.discount,
      total: summary.total,
      pawPoints: summary.pawPoints,
    },
  };
}

async function confirmWalletPayment(userId, { bookingId, couponCode }) {
  if (process.env.WALLET_PAYMENTS_ENABLED !== "true") {
    throw new AppError("Wallet payments are not enabled", 503);
  }

  const walletService = require("./wallet.service");

  const booking = await getBookingForUser(userId, bookingId, { payment: true });

  if (booking.payment?.paymentStatus === "paid") {
    throw new AppError("This booking has already been paid", 409);
  }

  const summary = await buildPriceSummary(booking, couponCode);
  const vendorAmount = parseFloat((summary.subtotal - summary.discount).toFixed(2));

  const result = await prisma.$transaction(async (tx) => {
    if (summary.appliedCoupon) {
      await tx.coupon.update({
        where: { id: summary.appliedCoupon.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    await walletService.debitWallet(
      userId,
      {
        amount: summary.total,
        type: "payment",
        description: `Booking payment`,
        referenceId: bookingId,
      },
      tx
    );

    const payment = await tx.payment.upsert({
      where: { bookingId },
      update: {
        subtotal: summary.subtotal,
        platformFee: summary.platformFee,
        taxAmount: summary.taxAmount,
        discount: summary.discount,
        couponCode: couponCode || null,
        amount: summary.total,
        vendorAmount,
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
        vendorAmount,
        pawPoints: summary.pawPoints,
        paymentMethod: "wallet",
        paymentStatus: "paid",
        paidAt: new Date(),
      },
    });

    const updatedBooking = await tx.partnerBooking.update({
      where: { id: bookingId },
      data: { status: "confirmed" },
      include: {
        business: { select: { id: true, businessName: true, location: true, city: true, state: true } },
        service: { select: { name: true, price: true } },
      },
    });

    return { payment, updatedBooking };
  });

  return {
    booking: {
      ...result.updatedBooking,
      appointmentId: formatAppointmentId(result.updatedBooking.id),
      dateTimeFormatted: formatDateTime(result.updatedBooking.bookingDate, result.updatedBooking.bookingTime),
    },
    payment: {
      id: result.payment.id,
      amount: result.payment.amount,
      paymentMethod: "wallet",
      paymentStatus: "paid",
      pawPoints: result.payment.pawPoints,
      paidAt: result.payment.paidAt,
    },
  };
}

async function verifyPayment(userId, paymentIntentId) {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  const payment = await prisma.payment.findFirst({
    where: { transactionId: paymentIntentId },
    include: {
      booking: {
        select: {
          customerId: true,
          id: true, status: true, bookingDate: true, bookingTime: true,
          serviceName: true,
        },
      },
    },
  });

  if (!payment) throw new AppError("Payment record not found", 404);
  if (payment.booking.customerId !== userId) throw new AppError("Access denied", 403);

  if (intent.status === "succeeded" && payment.paymentStatus !== "paid") {
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    await finalizeBookingPayment(payment.bookingId, paymentIntentId, chargeId);
    payment.paymentStatus = "paid";
    const refreshed = await prisma.partnerBooking.findUnique({ where: { id: payment.bookingId }, select: { status: true } });
    if (refreshed) payment.booking.status = refreshed.status;
  }

  return {
    stripeStatus: intent.status,
    paymentStatus: payment.paymentStatus,
    bookingStatus: payment.booking?.status,
    bookingId: payment.bookingId,
    appointmentId: formatAppointmentId(payment.bookingId),
  };
}

async function getPaymentByBooking(req, bookingId) {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: {
      booking: {
        select: {
          customerId: true,
          serviceName: true, bookingDate: true, bookingTime: true, status: true,
          business: { select: { id: true, businessName: true } },
          service: { select: { name: true, serviceType: true } },
        },
      },
    },
  });

  if (!payment) throw new AppError("Payment not found", 404);
  assertOwnerOrAdmin(req, payment.booking.customerId);
  return payment;
}

async function handleStripeWebhook(rawBody, signature) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError("Stripe webhook is not configured", 503);
    }
    return { received: true };
  }

  if (!signature) {
    throw new AppError("Missing Stripe signature", 400);
  }

  const stripe = getStripe();
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const metadata = intent.metadata || {};

    if (metadata.type === "wallet_top_up" && metadata.userId) {
      const walletService = require("./wallet.service");
      await walletService.creditFromStripePayment(
        metadata.userId,
        intent.id,
        Number(metadata.amount)
      );
    } else if (metadata.bookingId) {
      const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      await finalizeBookingPayment(metadata.bookingId, intent.id, chargeId);
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    await prisma.payment.updateMany({
      where: { transactionId: intent.id },
      data: { paymentStatus: "failed" },
    });
  }

  if (event.type === "account.updated") {
    const connectService = require("./connect.service");
    await connectService.syncAccountFromWebhook(event.data.object);
  }

  return { received: true };
}

module.exports = {
  buildPriceSummary,
  getPaymentConfig,
  getPriceSummary,
  applyCoupon,
  createPaymentIntent,
  confirmWalletPayment,
  verifyPayment,
  getPaymentByBooking,
  handleStripeWebhook,
  finalizeBookingPayment,
};
