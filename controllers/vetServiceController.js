const asyncHandler = require("../middleware/asyncHandler");
const vetServiceService = require("../services/vetService.service");

exports.getVetServices = asyncHandler(async (req, res) => {
  const services = await vetServiceService.getVetServices(req.params.vetId);
  res.json({ success: true, data: services });
});

exports.createVetService = asyncHandler(async (req, res) => {
  const service = await vetServiceService.createVetService(req, req.params.vetId, req.body);
  res.status(201).json({ success: true, data: service });
});

exports.updateVetService = asyncHandler(async (req, res) => {
  const updated = await vetServiceService.updateVetService(req, req.params.vetId, req.params.serviceId, req.body);
  res.json({ success: true, data: updated });
});

exports.deleteVetService = asyncHandler(async (req, res) => {
  await vetServiceService.deleteVetService(req, req.params.vetId, req.params.serviceId);
  res.json({ success: true, message: "Service deactivated" });
});

exports.getAvailableSlots = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const result = await vetServiceService.getAvailableSlots(req.params.vetId, date);
  res.json({
    success: true,
    data: result.slots,
    meta: result.meta,
    ...(result.meta.message && { message: result.meta.message }),
  });
});
