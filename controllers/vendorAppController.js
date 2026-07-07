const asyncHandler = require("../middleware/asyncHandler");
const vendorAppService = require("../services/vendorApp.service");
const authService = require("../services/auth.service");

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

exports.startRequest = asyncHandler(async (req, res) => {
  const data = await vendorAppService.startRequest(req.user.id, req.params.id);
  res.json({ success: true, message: "Service session started", startTime: data.startTime, data: data.booking });
});

exports.updateRequestProgress = asyncHandler(async (req, res) => {
  const data = await vendorAppService.updateRequestProgress(req.user.id, req.params.id, req.body);
  res.json({ success: true, message: "Service progress updated", data });
});

exports.addRequestMedia = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  const data = await vendorAppService.addRequestMedia(req.user.id, req.params.id, files);
  res.status(201).json({ success: true, message: "Service media uploaded", data });
});

exports.updateRequestLocation = asyncHandler(async (req, res) => {
  const data = await vendorAppService.updateRequestLocation(req.user.id, req.params.id, req.body);
  res.json({ success: true, message: "Service location updated", data });
});

exports.completeRequest = asyncHandler(async (req, res) => {
  const data = await vendorAppService.completeRequest(req.user.id, req.params.id, req.body, req.files || {});
  res.json({ success: true, message: "Service completed", data });
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

exports.updateEmail = asyncHandler(async (req, res) => {
  if (req.body.verificationToken) {
    const data = await authService.verifyVendorEmailChange(req.user.id, req.body.verificationToken);
    return res.json({ success: true, message: "Email updated successfully", data });
  }

  const data = await authService.requestVendorEmailChange(req.user, req.body, req.ip);
  return res.json({ success: true, message: data.message, data });
});

exports.requestPhoneUpdate = asyncHandler(async (req, res) => {
  const data = await authService.requestVendorPhoneUpdate(req.user, req.body);
  res.json({ success: true, message: data.message, data });
});

exports.verifyPhoneUpdate = asyncHandler(async (req, res) => {
  const data = await authService.verifyVendorPhoneUpdate(req.user.id, req.body);
  res.json({ success: true, message: "Phone number updated successfully", data });
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

exports.getNotificationPreferences = asyncHandler(async (req, res) => {
  const data = await vendorAppService.getNotificationPreferences(req.user.id);
  res.json({ success: true, data });
});

exports.updateNotificationPreferences = asyncHandler(async (req, res) => {
  const data = await vendorAppService.updateNotificationPreferences(req.user.id, req.body);
  res.json({ success: true, message: "Notification preferences updated", data });
});
