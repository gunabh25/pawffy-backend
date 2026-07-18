const asyncHandler = require("../middleware/asyncHandler");
const connectService = require("../services/connect.service");

exports.onboard = asyncHandler(async (req, res) => {
  const data = await connectService.createOnboardingLink(req.user.id);
  res.json({ success: true, data });
});

exports.getStatus = asyncHandler(async (req, res) => {
  const data = await connectService.refreshAccountStatus(req.user.id);
  res.json({ success: true, data });
});
