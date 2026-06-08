const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

exports.createBooking = asyncHandler(async (req, res) => {
  const { petId, vetId, bookingType, bookingDate, bookingTime, symptoms, notes } = req.body;

  if (!petId || !bookingType || !bookingDate || !bookingTime) {
    return res.status(400).json({ success: false, message: "petId, bookingType, bookingDate and bookingTime are required" });
  }

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet || pet.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: "Pet not found or does not belong to you" });
  }

  const booking = await prisma.booking.create({
    data: {
      userId: req.user.id,
      petId,
      vetId: vetId || null,
      bookingType,
      bookingDate: new Date(bookingDate),
      bookingTime,
      symptoms,
      notes,
    },
    include: {
      pet: { select: { name: true, species: true } },
      vet: { select: { name: true, clinicName: true } },
    },
  });

  res.status(201).json({ success: true, data: booking });
});

exports.getMyBookings = asyncHandler(async (req, res) => {
  const { status, type } = req.query;

  const bookings = await prisma.booking.findMany({
    where: {
      userId: req.user.id,
      ...(status && { status }),
      ...(type && { bookingType: type }),
    },
    include: {
      pet: { select: { id: true, name: true, species: true, imageUrl: true } },
      vet: { select: { id: true, name: true, clinicName: true, specialization: true } },
      payment: { select: { paymentStatus: true, amount: true } },
    },
    orderBy: { bookingDate: "desc" },
  });

  res.json({ success: true, data: bookings });
});

exports.getBookingById = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      pet: true,
      vet: { include: { availability: true } },
      payment: true,
    },
  });

  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  res.json({ success: true, data: booking });
});

exports.updateBookingStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["pending", "confirmed", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(", ")}` });
  }

  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const updated = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status },
  });

  res.json({ success: true, data: updated });
});

exports.getAllBookings = asyncHandler(async (req, res) => {
  const { status, type, userId } = req.query;

  const bookings = await prisma.booking.findMany({
    where: {
      ...(status && { status }),
      ...(type && { bookingType: type }),
      ...(userId && { userId }),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      pet: { select: { id: true, name: true, species: true } },
      vet: { select: { id: true, name: true } },
      payment: { select: { paymentStatus: true, amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: bookings });
});
