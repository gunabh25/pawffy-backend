const asyncHandler = require("../middleware/asyncHandler");
const walkingBookingService = require("../services/walkingBooking.service");

exports.createWalkingBooking = asyncHandler(async (req, res) => {
  const booking = await walkingBookingService.createWalkingBooking(req.user.id, req.body);
  res.status(201).json({
    success: true,
    message: "Walking booking created successfully",
    bookingId: booking.id,
    data: booking,
  });
});

exports.getMyWalkingBookings = asyncHandler(async (req, res) => {
  const bookings = await walkingBookingService.getMyWalkingBookings(req.user.id);
  res.json({ success: true, data: bookings });
});

exports.getWalkingBookingById = asyncHandler(async (req, res) => {
  const booking = await walkingBookingService.getWalkingBookingById(req, req.params.id);
  res.json({ success: true, data: booking });
});
