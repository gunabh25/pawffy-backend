const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

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

async function topUp(userId, { amount }) {
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
    description: "Wallet top-up",
  });
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
};
