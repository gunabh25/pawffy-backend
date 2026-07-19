const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { getStripe, isStripeConfigured, getStripeCurrency } = require("../config/stripe");

const MAX_TOP_UP = 50000;
const MAX_WITHDRAW = 50000;

async function getOrCreateWallet(userId, tx = prisma) {
  let wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await tx.wallet.create({ data: { userId } });
  }
  return wallet;
}

function formatTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    balanceAfter: Number(row.balanceAfter),
    description: row.description,
    referenceId: row.referenceId,
    createdAt: row.createdAt,
  };
}

async function getWallet(userId, { limit = 20 } = {}) {
  const wallet = await getOrCreateWallet(userId);
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
  });

  return {
    balance: Number(wallet.balance),
    currency: wallet.currency,
    transactions: transactions.map(formatTransaction),
  };
}

async function creditWallet(userId, { amount, type, description, referenceId }, tx = prisma) {
  const wallet = await getOrCreateWallet(userId, tx);
  const credit = Number(amount);
  if (credit <= 0) throw new AppError("Amount must be greater than zero", 400);

  const balanceAfter = Number(wallet.balance) + credit;
  const updated = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
  });

  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: updated.id,
      type,
      amount: credit,
      balanceAfter,
      description,
      referenceId: referenceId || null,
    },
  });

  return { balance: Number(updated.balance), transaction: formatTransaction(transaction) };
}

async function debitWallet(userId, { amount, type, description, referenceId }, tx = prisma) {
  const wallet = await getOrCreateWallet(userId, tx);
  const debit = Number(amount);
  if (debit <= 0) throw new AppError("Amount must be greater than zero", 400);

  const current = Number(wallet.balance);
  if (current < debit) {
    throw new AppError("Insufficient wallet balance", 402);
  }

  const balanceAfter = current - debit;
  const updated = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
  });

  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: updated.id,
      type,
      amount: -debit,
      balanceAfter,
      description,
      referenceId: referenceId || null,
    },
  });

  return { balance: Number(updated.balance), transaction: formatTransaction(transaction) };
}

/**
 * Dev-only free credit. Never available in production.
 * Real top-ups must go through createTopUpIntent + verifyTopUp / Stripe webhook.
 */
async function topUp(userId, { amount }) {
  if (process.env.NODE_ENV === "production") {
    throw new AppError("Direct wallet top-up is disabled. Use Stripe top-up intent.", 403);
  }
  if (process.env.WALLET_DEV_TOPUP_ENABLED !== "true") {
    throw new AppError("Direct wallet top-up is disabled. Set WALLET_DEV_TOPUP_ENABLED=true for local testing.", 403);
  }
  if (process.env.WALLET_PAYMENTS_ENABLED !== "true") {
    throw new AppError("Wallet is not enabled", 503);
  }

  const value = Number(amount);
  if (value <= 0 || value > MAX_TOP_UP) {
    throw new AppError(`Top-up amount must be between 1 and ${MAX_TOP_UP}`, 400);
  }

  return creditWallet(userId, {
    amount: value,
    type: "top_up",
    description: "Wallet top-up (dev)",
  });
}

/** Convert Stripe amount (minor units) to major currency units. */
function amountFromStripeIntent(intent) {
  const minor = Number(intent?.amount);
  if (!Number.isFinite(minor) || minor <= 0) {
    throw new AppError("Invalid Stripe payment amount", 400);
  }
  return minor / 100;
}

async function creditFromStripePayment(userId, paymentIntentId, amount) {
  if (!paymentIntentId || !amount || amount <= 0) return null;

  const existing = await prisma.walletTransaction.findFirst({
    where: { referenceId: paymentIntentId, type: "top_up" },
  });
  if (existing) {
    const wallet = await getOrCreateWallet(userId);
    return { balance: Number(wallet.balance), transaction: formatTransaction(existing), alreadyCredited: true };
  }

  return {
    ...(await creditWallet(userId, {
      amount,
      type: "top_up",
      description: "Wallet top-up via Stripe",
      referenceId: paymentIntentId,
    })),
    alreadyCredited: false,
  };
}

async function createTopUpIntent(userId, { amount }) {
  if (!isStripeConfigured()) {
    throw new AppError("Stripe is not configured", 503);
  }
  if (process.env.WALLET_PAYMENTS_ENABLED !== "true") {
    throw new AppError("Wallet is not enabled", 503);
  }

  const value = Number(amount);
  if (value <= 0 || value > MAX_TOP_UP) {
    throw new AppError(`Top-up amount must be between 1 and ${MAX_TOP_UP}`, 400);
  }

  const currency = getStripeCurrency();
  const amountMinor = Math.round(value * 100);
  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountMinor,
    currency,
    payment_method_types: ["card"],
    metadata: {
      type: "wallet_top_up",
      userId,
      amount: String(value),
    },
    description: "Pawffy wallet top-up",
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: value,
    amountMinor,
    currency,
  };
}

async function verifyTopUp(userId, paymentIntentId) {
  if (!isStripeConfigured()) {
    throw new AppError("Stripe is not configured", 503);
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (intent.metadata?.userId !== userId) {
    throw new AppError("Access denied", 403);
  }
  if (intent.metadata?.type !== "wallet_top_up") {
    throw new AppError("Invalid payment intent for wallet top-up", 400);
  }

  if (intent.status === "succeeded") {
    const amount = amountFromStripeIntent(intent);
    const metaAmount = Number(intent.metadata?.amount);
    if (Number.isFinite(metaAmount) && Math.abs(metaAmount - amount) > 0.001) {
      throw new AppError("Payment amount mismatch", 400);
    }
    await creditFromStripePayment(userId, paymentIntentId, amount);
  }

  const wallet = await getWallet(userId, { limit: 5 });

  return {
    stripeStatus: intent.status,
    wallet,
  };
}

async function withdraw(userId, { amount }) {
  if (process.env.WALLET_PAYMENTS_ENABLED !== "true") {
    throw new AppError("Wallet is not enabled", 503);
  }

  const value = Number(amount);
  if (value <= 0 || value > MAX_WITHDRAW) {
    throw new AppError(`Withdrawal amount must be between 1 and ${MAX_WITHDRAW}`, 400);
  }

  return debitWallet(userId, {
    amount: value,
    type: "withdrawal",
    description: "Wallet withdrawal",
  });
}

module.exports = {
  getWallet,
  getOrCreateWallet,
  creditWallet,
  debitWallet,
  topUp,
  withdraw,
  createTopUpIntent,
  verifyTopUp,
  creditFromStripePayment,
  amountFromStripeIntent,
};
