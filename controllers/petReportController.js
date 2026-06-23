const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../middleware/errors");
const petReportService = require("../services/petReport.service");

exports.createLostReport = asyncHandler(async (req, res) => {
  const data = await petReportService.createReport(req.user.id, "Lost", req.body);
  res.status(201).json({ success: true, message: "Lost pet report created successfully", data });
});

exports.getLostReports = asyncHandler(async (req, res) => {
  const data = await petReportService.listReports("Lost");
  res.json({ success: true, count: data.length, data });
});

exports.getLostReportById = asyncHandler(async (req, res) => {
  const data = await petReportService.getReportById(req.params.id);
  if (data.postType !== "Lost") throw new AppError("Lost pet report not found", 404);
  res.json({ success: true, data });
});

exports.updateLostReport = asyncHandler(async (req, res) => {
  const data = await petReportService.updateReport(req, req.params.id, req.body);
  res.json({ success: true, message: "Lost pet report updated successfully", data });
});

exports.deleteLostReport = asyncHandler(async (req, res) => {
  const data = await petReportService.deleteReport(req, req.params.id);
  res.json({ success: true, message: "Lost pet report deleted successfully", data });
});

exports.createFoundReport = asyncHandler(async (req, res) => {
  const data = await petReportService.createReport(req.user.id, "Found", req.body);
  res.status(201).json({ success: true, message: "Found pet reported successfully", data });
});

exports.getFoundReports = asyncHandler(async (req, res) => {
  const data = await petReportService.listReports("Found");
  res.json({ success: true, count: data.length, data });
});

exports.getFoundReportById = asyncHandler(async (req, res) => {
  const data = await petReportService.getReportById(req.params.id);
  if (data.postType !== "Found") throw new AppError("Found pet not found", 404);
  res.json({ success: true, data });
});

exports.updateFoundReport = asyncHandler(async (req, res) => {
  const data = await petReportService.updateReport(req, req.params.id, req.body);
  res.json({ success: true, message: "Found pet updated successfully", data });
});

exports.deleteFoundReport = asyncHandler(async (req, res) => {
  await petReportService.deleteReport(req, req.params.id);
  res.json({ success: true, message: "Found pet deleted successfully", id: req.params.id });
});

exports.getAllReports = asyncHandler(async (req, res) => {
  const data = await petReportService.getAllReportsGrouped();
  res.json({ success: true, ...data });
});
