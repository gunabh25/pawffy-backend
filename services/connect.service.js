const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const logger = require("../utils/logger");
const {
  getStripe,
  getStripeCurrency,
  getConnectReturnUrl,
  getConnectRefreshUrl,
} = require("../config/stripe");

function toMinor(amount) {
  return Math.round(Number(amount) * 100);
}

async function getBusinessOrThrow(userId, tx = prisma) {
  const business = await tx.partnerBusiness.findUnique({
    where: { userId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!business) throw new AppError("Create your vendor profile first", 404);
  return business;
}

// ─── Onboarding ────────────────────────────────────────────────────────────────
async function createOnboardingLink(userId) {
  const stripe = getStripe();
  const business = await getBusinessOrThrow(userId);

  let accountId = business.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: business.user?.email || undefined,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      metadata: { businessId: business.id, userId },
    });
    accountId = account.id;
    await prisma.partnerBusiness.update({
      where: { id: business.id },
      data: { stripeAccountId: accountId },
    });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: getConnectRefreshUrl(),
    return_url: getConnectReturnUrl(),
    type: "account_onboarding",
  });

  return { url: link.url, stripeAccountId: accountId };
}

async function persistAccountStatus(businessId, account) {
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const chargesEnabled = Boolean(account.charges_enabled);
  return prisma.partnerBusiness.update({
    where: { id: businessId },
    data: {
      payoutsEnabled,
      chargesEnabled,
      ...(payoutsEnabled && account.details_submitted ? { stripeOnboardedAt: new Date() } : {}),
    },
    select: { id: true, payoutsEnabled: true, chargesEnabled: true, stripeAccountId: true },
  });
}

async function refreshAccountStatus(userId) {
  const business = await getBusinessOrThrow(userId);
  if (!business.stripeAccountId) {
    return {
      onboarded: false,
      payoutsEnabled: false,
      chargesEnabled: false,
      stripeAccountId: null,
    };
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(business.stripeAccountId);
  const updated = await persistAccountStatus(business.id, account);

  return {
    onboarded: Boolean(account.details_submitted),
    payoutsEnabled: updated.payoutsEnabled,
    chargesEnabled: updated.chargesEnabled,
    stripeAccountId: updated.stripeAccountId,
    requirementsDue: account.requirements?.currently_due || [],
  };
}

// Lightweight, DB-only onboarding check (no live Stripe call). Use this to
// quickly gate UI/actions; use refreshAccountStatus when you need fresh state.
async function getOnboardingState(userId) {
  const business = await prisma.partnerBusiness.findUnique({
    where: { userId },
    select: {
      stripeAccountId: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      stripeOnboardedAt: true,
    },
  });
  if (!business) throw new AppError("Create your vendor profile first", 404);

  return {
    onboarded: Boolean(business.stripeAccountId && business.payoutsEnabled),
    payoutsEnabled: Boolean(business.payoutsEnabled),
    chargesEnabled: Boolean(business.chargesEnabled),
    hasStripeAccount: Boolean(business.stripeAccountId),
    stripeAccountId: business.stripeAccountId || null,
    onboardedAt: business.stripeOnboardedAt || null,
  };
}

async function syncAccountFromWebhook(account) {
  const business = await prisma.partnerBusiness.findFirst({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });
  if (!business) return;
  await persistAccountStatus(business.id, account);
}

// ─── Payout on completion ────────────────────────────────────────────────────────
async function payoutForBooking(bookingId, tx = prisma) {
  const walletService = require("./wallet.service");

  const booking = await tx.partnerBooking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      business: { select: { id: true, userId: true, stripeAccountId: true, payoutsEnabled: true, businessName: true } },
    },
  });

  if (!booking || !booking.payment) return { skipped: true, reason: "no_payment" };
  const payment = booking.payment;

  if (payment.paymentStatus !== "paid") return { skipped: true, reason: "not_paid" };
  if (payment.payoutStatus === "paid") return { alreadyPaid: true };

  const vendorAmount = Number(
    payment.vendorAmount != null
      ? payment.vendorAmount
      : Number(payment.subtotal || 0) - Number(payment.discount || 0)
  );

  // Nothing owed to the vendor (e.g. fully discounted) — mark settled and move on.
  if (vendorAmount <= 0) {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        payoutStatus: "paid",
        payoutMethod: payment.paymentMethod === "wallet" ? "wallet" : "stripe",
        vendorAmount: 0,
        paidOutAt: new Date(),
      },
    });
    return { paidOut: true, vendorAmount: 0 };
  }

  let payoutMethod;
  let transferId = null;

  if (payment.paymentMethod === "wallet") {
    await walletService.creditWallet(
      booking.business.userId,
      {
        amount: vendorAmount,
        type: "payment",
        description: `Payout for ${booking.serviceName}`,
        referenceId: bookingId,
      },
      tx
    );
    payoutMethod = "wallet";
  } else {
    if (!booking.business.stripeAccountId) {
      throw new AppError("Vendor has no connected Stripe account for payout", 400);
    }
    const stripe = getStripe();
    const transfer = await stripe.transfers.create({
      amount: toMinor(vendorAmount),
      currency: getStripeCurrency(),
      destination: booking.business.stripeAccountId,
      ...(payment.chargeId ? { source_transaction: payment.chargeId } : {}),
      transfer_group: bookingId,
      metadata: { bookingId, businessId: booking.business.id },
    });
    transferId = transfer.id;
    payoutMethod = "stripe";
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      payoutStatus: "paid",
      payoutMethod,
      transferId,
      vendorAmount,
      paidOutAt: new Date(),
    },
  });

  logger.info({ event: "VENDOR_PAYOUT", bookingId, payoutMethod, vendorAmount, transferId });
  return { paidOut: true, vendorAmount, payoutMethod, transferId };
}

// ─── Refund on cancel (before payout) ─────────────────────────────────────────────
async function refundForBooking(bookingId, tx = prisma) {
  const walletService = require("./wallet.service");

  const booking = await tx.partnerBooking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });

  if (!booking || !booking.payment) return { skipped: true, reason: "no_payment" };
  const payment = booking.payment;

  if (payment.paymentStatus !== "paid") return { skipped: true, reason: "not_paid" };
  if (payment.payoutStatus === "paid") return { skipped: true, reason: "already_paid_out" };

  const amount = Number(payment.amount || 0);
  let refundId = null;

  if (payment.paymentMethod === "wallet") {
    if (amount > 0) {
      await walletService.creditWallet(
        booking.customerId,
        {
          amount,
          type: "refund",
          description: `Refund for ${booking.serviceName}`,
          referenceId: bookingId,
        },
        tx
      );
    }
  } else if (payment.transactionId) {
    const stripe = getStripe();
    const refund = await stripe.refunds.create({ payment_intent: payment.transactionId });
    refundId = refund.id;
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      paymentStatus: "refunded",
      payoutStatus: "reversed",
      refundId,
      refundedAt: new Date(),
    },
  });

  logger.info({ event: "BOOKING_REFUND", bookingId, method: payment.paymentMethod, amount, refundId });
  return { refunded: true, amount, refundId };
}

module.exports = {
  createOnboardingLink,
  refreshAccountStatus,
  getOnboardingState,
  syncAccountFromWebhook,
  payoutForBooking,
  refundForBooking,
};
