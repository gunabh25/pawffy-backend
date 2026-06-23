const asyncHandler = require("../middleware/asyncHandler");
const dashboardService = require("../services/dashboard.service");

exports.getDashboard = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDashboard(req, req.body);
  res.json(result);
});

exports.getUserById = asyncHandler(async (req, res) => {
  const user = await dashboardService.getUserSummaryForRequest(req, req.params.id);
  res.json({ success: true, data: user });
});

exports.getPartnersNearby = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const partners = await dashboardService.getPartnersNearby(latitude, longitude);
  res.json({ success: true, data: partners });
});

exports.getNotificationsById = asyncHandler(async (req, res) => {
  const notifications = await dashboardService.getUserNotificationsForRequest(req, req.params.id);
  res.json({ success: true, data: notifications });
});

exports.getActiveCategories = asyncHandler(async (req, res) => {
  const categories = await dashboardService.getActiveCategories();
  res.json({ success: true, data: categories });
});

exports.getBanner = asyncHandler(async (req, res) => {
  const banner = await dashboardService.getBannerByPlatform(req.query.platform);
  res.json({ success: true, data: banner });
});
