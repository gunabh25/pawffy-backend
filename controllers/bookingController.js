const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

const PLATFORM_FEE = 5;
const TAX_RATE = 0.05;
const PAW_POINTS_RATE = 1; // 1 PawPoint per dollar

// ─── POST /api/bookings — Create a booking (Screen 4 → "Review & Confirm") ────
// Caller sends: vetId, serviceId, petId, bookingType, bookingDate, bookingTime,
//               reasonForVisit, symptoms (comma-separated), symptomsDuration, notes
exports.createBooking = asyncHandler(async (req, res) => {
  const {
    petId, vetId, serviceId,
    bookingType, bookingDate, bookingTime,
    reasonForVisit, symptoms, symptomsDuration, notes,
  } = req.body;

  if (!petId || !bookingType || !bookingDate || !bookingTime) {
    return res.status(400).json({
      success: false,
      message: "petId, bookingType, bookingDate and bookingTime are required",
    });
  }

  // Verify the pet belongs to this user
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet || pet.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: "Pet not found or does not belong to you" });
  }

  // Verify the service belongs to the vet (if serviceId provided)
  if (serviceId && vetId) {
    const service = await prisma.vetService.findFirst({
      where: { id: serviceId, vetId, isActive: true },
    });
    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found for this vet" });
    }
  }

  // Check if the slot is already taken
  if (vetId && bookingDate && bookingTime) {
    const conflict = await prisma.booking.findFirst({
      where: {
        vetId,
        bookingDate: new Date(bookingDate),
        bookingTime,
        status: { in: ["pending", "confirmed"] },
      },
    });
    if (conflict) {
      return res.status(409).json({ success: false, message: "This time slot is already booked. Please choose another." });
    }
  }

  const booking = await prisma.booking.create({
    data: {
      userId: req.user.id,
      petId,
      vetId: vetId || null,
      serviceId: serviceId || null,
      bookingType,
      bookingDate: new Date(bookingDate),
      bookingTime,
      reasonForVisit,
      symptoms,
      symptomsDuration,
      notes,
    },
    include: {
      pet: { select: { id: true, name: true, species: true, breed: true, imageUrl: true } },
      vet: { select: { id: true, name: true, clinicName: true, clinicAddress: true, clinicCity: true, specialization: true, profileImage: true, phone: true } },
      service: { select: { id: true, name: true, description: true, price: true, duration: true } },
    },
  });

  res.status(201).json({ success: true, data: booking });
});

// ─── GET /api/bookings — My bookings list ─────────────────────────────────────
exports.getMyBookings = asyncHandler(async (req, res) => {
  const { status, type } = req.query;

  const bookings = await prisma.booking.findMany({
    where: {
      userId: req.user.id,
      ...(status && { status }),
      ...(type && { bookingType: type }),
    },
    include: {
      pet: { select: { id: true, name: true, species: true, breed: true, imageUrl: true } },
      vet: { select: { id: true, name: true, clinicName: true, specialization: true, profileImage: true, serviceType: true } },
      service: { select: { id: true, name: true, price: true } },
      payment: { select: { paymentStatus: true, amount: true, paymentMethod: true } },
    },
    orderBy: { bookingDate: "desc" },
  });

  res.json({ success: true, data: bookings });
});

// ─── GET /api/bookings/:id — Full booking details (Screen 9 - Confirmation) ──
exports.getBookingById = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      pet: { select: { id: true, name: true, species: true, breed: true, imageUrl: true, age: true } },
      vet: {
        select: {
          id: true, name: true, clinicName: true, clinicAddress: true, clinicCity: true,
          specialization: true, serviceType: true, profileImage: true, phone: true,
          rating: true,
        },
      },
      service: { select: { id: true, name: true, description: true, price: true, duration: true } },
      payment: true,
    },
  });

  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Format for Confirmation Screen
  const response = {
    ...booking,
    appointmentId: `APT${booking.id.replace(/-/g, "").toUpperCase().slice(0, 10)}`,
    dateTimeFormatted: formatDateTime(booking.bookingDate, booking.bookingTime),
  };

  res.json({ success: true, data: response });
});

// ─── PATCH /api/bookings/:id/status ──────────────────────────────────────────
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
    include: {
      pet: { select: { name: true } },
      vet: { select: { name: true } },
    },
  });

  res.json({ success: true, data: updated });
});

// ─── GET /api/bookings/all — Admin: all bookings ──────────────────────────────
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
      vet: { select: { id: true, name: true, clinicName: true } },
      service: { select: { name: true, price: true } },
      payment: { select: { paymentStatus: true, amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: bookings });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDateTime(date, time) {
  const d = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}
