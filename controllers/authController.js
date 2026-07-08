const asyncHandler = require("../middleware/asyncHandler");
const { sanitizeUser } = require("../utils/auth");
const authService = require("../services/auth.service");

exports.register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, message: "User registered successfully", data: result });
});

exports.registerVendor = asyncHandler(async (req, res) => {
  const result = await authService.registerVendor(req.body);
  res.status(201).json({
    success: true,
    message: "Vendor account created successfully",
    data: result,
  });
});

exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, req.ip);
  res.status(200).json({
    success: true,
    message: result.requires2fa ? "OTP required to complete login" : "Login successful",
    data: result,
  });
});

exports.loginVendor = asyncHandler(async (req, res) => {
  const result = await authService.loginVendor(req.body, req.ip);
  res.status(200).json({
    success: true,
    message: result.requires2fa ? "OTP required to complete login" : "Login successful",
    data: result,
  });
});

exports.verifyLogin2fa = asyncHandler(async (req, res) => {
  const result = await authService.verifyLogin2fa(req.body, req.ip);
  res.status(200).json({ success: true, message: "OTP verified successfully", data: result });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: sanitizeUser(req.user) });
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  res.status(200).json({ success: true, message: "Logged out successfully." });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);
  res.status(200).json({ success: true, message: result.message, data: result.data });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  res.status(200).json({ success: true, message: "Password reset successfully. Please login with your new password." });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user, req.body, req.ip);
  res.status(200).json({
    success: true,
    message: "Password changed. All other sessions have been logged out.",
    data: result,
  });
});
