const asyncHandler = require("../middleware/asyncHandler");
const vendorAdoptionService = require("../services/vendorAdoption.service");

exports.listAdoptions = asyncHandler(async (req, res) => {
  const data = await vendorAdoptionService.listAdoptions(req.user.id, req.query);
  res.json({ success: true, data });
});

exports.getAdoption = asyncHandler(async (req, res) => {
  const data = await vendorAdoptionService.getAdoptionDetail(req.user.id, req.params.adoptionId);
  res.json({ success: true, data });
});

exports.reviewAdoption = asyncHandler(async (req, res) => {
  const data = await vendorAdoptionService.reviewAdoption(req.user.id, req.params.adoptionId, req.body);
  res.json({ success: true, message: "Adoption review updated", data });
});

exports.scheduleMeet = asyncHandler(async (req, res) => {
  const data = await vendorAdoptionService.scheduleMeet(req.user.id, req.params.adoptionId, req.body);
  res.json({ success: true, message: "Meet and greet scheduled", data });
});

exports.recordMeetOutcome = asyncHandler(async (req, res) => {
  const data = await vendorAdoptionService.recordMeetOutcome(req.user.id, req.params.adoptionId, req.body);
  res.json({ success: true, message: "Meet outcome recorded", data });
});

exports.uploadDocuments = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  const data = await vendorAdoptionService.uploadDocuments(
    req.user.id,
    req.params.adoptionId,
    files,
    req.body
  );
  res.status(201).json({ success: true, message: "Adoption document uploaded", data });
});

exports.collectPayment = asyncHandler(async (req, res) => {
  const data = await vendorAdoptionService.collectPayment(req.user.id, req.params.adoptionId, req.body);
  res.json({ success: true, message: "Adoption payment processed", data });
});
