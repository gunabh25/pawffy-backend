const asyncHandler = require("../middleware/asyncHandler");
const vendorBookingService = require("../services/vendorBooking.service");

exports.getVendorSlots = asyncHandler(async (req, res) => {
  const data = await vendorBookingService.getVendorSlotsInternal(req.params.vendorId, req.query.date, {
    serviceId: req.query.serviceId,
    slotDurationMinutes: req.query.slotDurationMinutes,
  });
  res.json({ success: true, data });
});

