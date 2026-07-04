const asyncHandler = require("../middleware/asyncHandler");
const vendorAppService = require("../services/vendorApp.service");

exports.getHome = asyncHandler(async (req, res) => {
  const data = await vendorAppService.getHome(req.user.id);
  res.json({ success: true, data });
});

exports.setOnlineStatus = asyncHandler(async (req, res) => {
  const data = await vendorAppService.setOnlineStatus(req.user.id, req.body.isOnline);
  res.json({
    success: true,
    message: data.isOnline ? "You are online and accepting requests" : "You are offline",
    data,
  });
});

exports.getRequests = asyncHandler(async (req, res) => {
  const data = await vendorAppService.getRequests(req.user.id, {
    status: req.query.status,
    search: req.query.search,
  });
  res.json({ success: true, data });
});

exports.acceptRequest = asyncHandler(async (req, res) => {
  const data = await vendorAppService.respondToRequest(req.user.id, req.params.id, "accept");
  res.json({ success: true, message: "Request accepted", data });
});

exports.rejectRequest = asyncHandler(async (req, res) => {
  const data = await vendorAppService.respondToRequest(req.user.id, req.params.id, "reject");
  res.json({ success: true, message: "Request rejected", data });
});

exports.getCalendar = asyncHandler(async (req, res) => {
  const data = await vendorAppService.getCalendar(req.user.id, req.query.date);
  res.json({ success: true, data });
});

exports.listBlockedDates = asyncHandler(async (req, res) => {
  const data = await vendorAppService.listBlockedDates(req.user.id);
  res.json({ success: true, data });
});

exports.addBlockedDate = asyncHandler(async (req, res) => {
  const data = await vendorAppService.addBlockedDate(req.user.id, req.body);
  res.status(201).json({ success: true, message: "Date blocked", data });
});

exports.removeBlockedDate = asyncHandler(async (req, res) => {
  const data = await vendorAppService.removeBlockedDate(req.user.id, req.params.id);
  res.json({ success: true, message: "Blocked date removed", data });
});

exports.getProfile = asyncHandler(async (req, res) => {
  const data = await vendorAppService.getProfile(req.user.id, req.query.period);
  res.json({ success: true, data });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const data = await vendorAppService.updateProfile(req.user.id, req.body);
  res.json({ success: true, message: "Profile updated", data });
});

exports.listServices = asyncHandler(async (req, res) => {
  const data = await vendorAppService.listServices(req.user.id);
  res.json({ success: true, data });
});

exports.getChats = asyncHandler(async (req, res) => {
  const data = await vendorAppService.getChats(req.user.id, req.query.search);
  res.json({ success: true, data });
});

exports.getUnreadNotifications = asyncHandler(async (req, res) => {
  const data = await vendorAppService.getUnreadNotifications(req.user.id);
  res.json({ success: true, data });
});
