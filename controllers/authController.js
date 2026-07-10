const asyncHandler = require("../middleware/asyncHandler");
const { sanitizeUser } = require("../utils/auth");
const authService = require("../services/auth.service");
const supabaseAuthService = require("../services/supabaseAuth.service");

exports.session = asyncHandler(async (req, res) => {
  const result = await supabaseAuthService.exchangeSession(req.body);
  res.status(200).json({
    success: true,
    message: "Signed in successfully",
    data: result,
  });
});

exports.registerVendor = asyncHandler(async (req, res) => {
  const result = await supabaseAuthService.registerVendor(req.body);
  res.status(201).json({
    success: true,
    message: "Vendor account created successfully",
    data: result,
  });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: sanitizeUser(req.user) });
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  res.status(200).json({ success: true, message: "Logged out successfully." });
});
