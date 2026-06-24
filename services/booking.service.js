const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { requirePetAccess, assertOwnerOrAdmin } = require("../utils/petAccess");
const { formatDateTime, formatAppointmentId } = require("../utils/formatters");

const PET_SELECT = { id: true, name: true, species: true, breed: true, imageUrl: true };
const VET_SELECT = {
  id: true, name: true, clinicName: true, clinicAddress: true, clinicCity: true,
  specialization: true, profileImage: true, phone: true, serviceType: true, rating: true,
};
const SERVICE_SELECT = { id: true, name: true, description: true, price: true, duration: true };

async function createBooking(user, data) {
  const {
    petId, vetId, serviceId,
    bookingType, bookingDate, bookingTime,
    reasonForVisit, symptoms, symptomsDuration, notes,
  } = data;

  await requirePetAccess(user, petId);

  if (serviceId && vetId) {
    const service = await prisma.vetService.findFirst({
      where: { id: serviceId, vetId, isActive: true },
    });
    if (!service) throw new AppError("Service not found for this vet", 404);
  }

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
      throw new AppError("This time slot is already booked. Please choose another.", 409);
    }
  }

  return prisma.booking.create({
    data: {
      userId: user.id,
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
      pet: { select: PET_SELECT },
      vet: { select: VET_SELECT },
      service: { select: SERVICE_SELECT },
    },
  });
}

async function getMyBookings(userId, { status, type } = {}) {
  return prisma.booking.findMany({
    where: {
      userId,
      ...(status && { status }),
      ...(type && { bookingType: type }),
    },
    include: {
      pet: { select: PET_SELECT },
      vet: { select: { ...VET_SELECT, serviceType: true } },
      service: { select: { id: true, name: true, price: true } },
      payment: { select: { paymentStatus: true, amount: true, paymentMethod: true } },
    },
    orderBy: { bookingDate: "desc" },
  });
}

async function getBookingById(req, bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      pet: { select: { ...PET_SELECT, age: true } },
      vet: { select: VET_SELECT },
      service: { select: SERVICE_SELECT },
      payment: true,
    },
  });

  if (!booking) throw new AppError("Booking not found", 404);
  assertOwnerOrAdmin(req, booking.userId);

  return {
    ...booking,
    appointmentId: formatAppointmentId(booking.id),
    dateTimeFormatted: formatDateTime(booking.bookingDate, booking.bookingTime),
  };
}

async function updateBookingStatus(req, bookingId, status) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError("Booking not found", 404);

  if (req.user.role === "admin") {
    // admins may set any valid status
  } else if (booking.userId === req.user.id) {
    if (status !== "cancelled") {
      throw new AppError("You can only cancel your booking", 403);
    }
  } else {
    throw new AppError("Access denied", 403);
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status },
    include: {
      pet: { select: { name: true } },
      vet: { select: { name: true } },
    },
  });
}

async function getAllBookings(filters = {}) {
  const { status, type, userId } = filters;

  return prisma.booking.findMany({
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
}

module.exports = {
  createBooking,
  getMyBookings,
  getBookingById,
  updateBookingStatus,
  getAllBookings,
};
