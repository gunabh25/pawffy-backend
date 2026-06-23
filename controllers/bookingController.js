const asyncHandler = require("../middleware/asyncHandler");
const bookingService = require("../services/booking.service");

exports.createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(req.user, req.body);
  res.status(201).json({ success: true, data: booking });
});

exports.getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingService.getMyBookings(req.user.id, req.query);
  res.json({ success: true, data: bookings });
});

exports.getBookingById = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingById(req, req.params.id);
  res.json({ success: true, data: booking });
});

exports.updateBookingStatus = asyncHandler(async (req, res) => {
  const updated = await bookingService.updateBookingStatus(req, req.params.id, req.body.status);
  res.json({ success: true, data: updated });
});

exports.getAllBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingService.getAllBookings(req.query);
  res.json({ success: true, data: bookings });
});
