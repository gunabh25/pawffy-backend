const asyncHandler = require("../middleware/asyncHandler");
const walletService = require("../services/wallet.service");

exports.getWallet = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const data = await walletService.getWallet(req.user.id, { limit });
  res.json({ success: true, data });
});

exports.topUp = asyncHandler(async (req, res) => {
  const data = await walletService.topUp(req.user.id, req.body);
  res.status(201).json({
    success: true,
    message: "Wallet topped up successfully",
    data,
  });
});

exports.withdraw = asyncHandler(async (req, res) => {
  const data = await walletService.withdraw(req.user.id, req.body);
  res.json({
    success: true,
    message: "Withdrawal processed successfully",
    data,
  });
});

exports.createTopUpIntent = asyncHandler(async (req, res) => {
  const data = await walletService.createTopUpIntent(req.user.id, req.body);
  res.json({ success: true, data });
});

exports.verifyTopUp = asyncHandler(async (req, res) => {
  const data = await walletService.verifyTopUp(req.user.id, req.body.paymentIntentId);
  res.json({ success: true, data });
});
