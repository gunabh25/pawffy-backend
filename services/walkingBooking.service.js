const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

function buildSlotTime(walkingType, slotTime = {}) {
  if (walkingType === "Once a day") {
    return { morningSlot: slotTime.morningSlot || "" };
  }
  if (walkingType === "Twice a day") {
    return {
      morningSlot: slotTime.morningSlot || "",
      eveningSlot: slotTime.eveningSlot || "",
    };
  }
  return slotTime;
}

async function createWalkingBooking(userId, body) {
  const {
    selectedAddress,
    selectedDays,
    selectedPetList,
    selectedService,
    selectedPackage,
    isPackage,
    partnerId,
    walkingType,
    slotTime,
    walkingDuration,
    paymentStatus,
  } = body;

  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  if (!partner || partner.role !== "partner") {
    throw new AppError("Partner not found", 404);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, address: true, city: true, state: true },
  });

  const booking = await prisma.walkingBooking.create({
    data: {
      userId,
      partnerId,
      walkingType,
      selectedDays,
      walkingDuration,
      selectedAddress: selectedAddress || { fullAddress: user?.address || "" },
      selectedPetList,
      selectedService,
      selectedPackage: selectedPackage || null,
      isPackage: isPackage ?? false,
      slotTime: buildSlotTime(walkingType, slotTime),
      paymentStatus: paymentStatus || "Pending",
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      partner: { select: { id: true, name: true, email: true, phone: true, profileImage: true } },
    },
  });

  return booking;
}

async function getMyWalkingBookings(userId) {
  return prisma.walkingBooking.findMany({
    where: { userId },
    include: {
      partner: { select: { id: true, name: true, profileImage: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function getWalkingBookingById(req, id) {
  const booking = await prisma.walkingBooking.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      partner: { select: { id: true, name: true, profileImage: true, phone: true } },
    },
  });

  if (!booking) throw new AppError("Walking booking not found", 404);
  if (booking.userId !== req.user.id && booking.partnerId !== req.user.id && req.user.role !== "admin") {
    throw new AppError("Access denied", 403);
  }

  return booking;
}

module.exports = {
  createWalkingBooking,
  getMyWalkingBookings,
  getWalkingBookingById,
};
