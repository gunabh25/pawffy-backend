const asyncHandler = require("../middleware/asyncHandler");
const vendorOnboardingService = require("../services/vendorOnboarding.service");

exports.getOnboarding = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.getOnboarding(req.user.id);
  res.json({ success: true, data });
});

exports.updateBusiness = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.updateBusiness(req.user.id, req.body);
  res.json({ success: true, message: "Business information saved", data });
});

exports.createService = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.createService(req.user.id, req.body);
  res.status(201).json({ success: true, message: "Service added", data });
});

exports.updateService = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.updateService(req.user.id, req.params.id, req.body);
  res.json({ success: true, message: "Service updated", data });
});

exports.deleteService = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.deleteService(req.user.id, req.params.id);
  res.json({ success: true, message: "Service deleted", data });
});

exports.updateAvailability = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.updateAvailability(req.user.id, req.body);
  res.json({ success: true, message: "Availability saved", data });
});

exports.getAvailability = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.getAvailability(req.user.id);
  res.json({ success: true, data });
});

exports.manageAvailability = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.manageAvailability(req.user.id, req.body);
  res.json({ success: true, message: "Availability updated", data });
});

exports.createLiveService = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.createService(req.user.id, req.body, { live: true });
  res.status(201).json({ success: true, message: "Service added", data });
});

exports.updateLiveService = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.updateService(req.user.id, req.params.id, req.body, { live: true });
  res.json({ success: true, message: "Service updated", data });
});

exports.deleteLiveService = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.deleteService(req.user.id, req.params.id, { live: true });
  res.json({ success: true, message: "Service deleted", data });
});

exports.uploadDocument = asyncHandler(async (req, res) => {
  const documentType = req.body.documentType || "business_license";
  const data = await vendorOnboardingService.uploadDocument(req.user.id, req.file, documentType);
  res.status(201).json({ success: true, message: "Document uploaded", data });
});

exports.deleteDocument = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.deleteDocument(req.user.id, req.params.id);
  res.json({ success: true, message: "Document deleted", data });
});

exports.getReview = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.getReview(req.user.id);
  res.json({ success: true, data });
});

exports.submitOnboarding = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.submitOnboarding(req.user.id);
  res.json({
    success: true,
    message: "Application submitted. Verification usually takes 24-48 hours.",
    data,
  });
});

exports.getDashboard = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.getDashboard(req.user.id);
  res.json({ success: true, data });
});

exports.listPendingApplications = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.listPendingApplications();
  res.json({ success: true, data });
});

exports.reviewApplication = asyncHandler(async (req, res) => {
  const data = await vendorOnboardingService.reviewApplication(req.params.businessId, req.body);
  res.json({
    success: true,
    message: data.verificationStatus === "verified" ? "Business verified" : "Application rejected",
    data,
  });
});
