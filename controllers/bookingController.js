const asyncHandler = require("../middleware/asyncHandler");
const bookingService = require("../services/vendorBooking.service");

exports.createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(req.user.id, req.body);
  res.status(201).json({ success: true, message: "Booking created", data: booking });
});

exports.getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingService.getMyBookings(req.user.id, req.query);
  res.json({ success: true, data: bookings });
});

exports.getBookingById = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingById(req.user.id, req.params.id);
  res.json({ success: true, data: booking });
});

exports.cancelBooking = asyncHandler(async (req, res) => {
  const updated = await bookingService.cancelBooking(req.user.id, req.params.id);
  res.json({ success: true, message: "Booking cancelled", data: updated });
});
