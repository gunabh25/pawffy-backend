const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const logger = require("../utils/logger");
const { formatDateTime, formatAppointmentId } = require("../utils/formatters");

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_UTC = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Matches the same pattern used for vendor availability start/end times.
// Accepts "09:00", "9:00 AM", "09:00 PM", "18:30".
const TIME_PATTERN = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$|^([01]\d|2[0-3]):[0-5]\d$/i;

function parseDateOnly(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new AppError("date must be in YYYY-MM-DD format", 400);
  }
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function parseTimeToMinutes(timeStr) {
  if (!TIME_PATTERN.test(timeStr)) {
    throw new AppError("Invalid time format. Use HH:MM or HH:MM AM/PM", 400);
  }

  const s = String(timeStr).trim();
  const ampmMatch = s.match(/^((0?[1-9])|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = parseInt(ampmMatch[3], 10);
    const ampm = ampmMatch[4].toUpperCase();

    if (ampm === "AM") {
      if (hour === 12) hour = 0;
    } else {
      if (hour !== 12) hour += 12;
    }
    return hour * 60 + minute;
  }

  const m24 = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m24) throw new AppError("Invalid time format", 400);
  const hour = parseInt(m24[1], 10);
  const minute = parseInt(m24[2], 10);
  return hour * 60 + minute;
}

function formatMinutesToHHMM(totalMinutes) {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(m / 60);
  const minute = m % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toDayOfWeekUTC(date) {
  const day = DAY_NAMES_UTC[date.getUTCDay()];
  // DB stores dayOfWeek as Mon/Tue/... (not Sun? it does store Sun)
  if (!DAYS.includes(day)) throw new AppError("Invalid day for availability", 500);
  return day;
}

async function getVendorAvailabilityWindow(businessId, date) {
  const dayOfWeek = toDayOfWeekUTC(date);
  const availability = await prisma.partnerAvailability.findFirst({
    where: { businessId, dayOfWeek, isAvailable: true },
    select: {
      dayOfWeek: true,
      startTime: true,
      endTime: true,
    },
  });

  return availability || null;
}

function generateSlotGrid({ startTime, endTime, slotDurationMinutes }) {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (endMin <= startMin) {
    throw new AppError("Invalid availability window (endTime must be after startTime)", 400);
  }

  const slots = [];
  for (let t = startMin; t + slotDurationMinutes <= endMin; t += slotDurationMinutes) {
    slots.push(formatMinutesToHHMM(t));
  }
  return slots;
}

async function getVendorSlotsInternal(businessId, dateStr, { serviceId, slotDurationMinutes } = {}) {
  const date = parseDateOnly(dateStr);

  const business = await prisma.partnerBusiness.findUnique({
    where: { id: businessId },
    select: { id: true, verificationStatus: true, sameDayRequests: true, city: true, state: true },
  });
  if (!business) throw new AppError("Vendor not found", 404);
  if (business.verificationStatus !== "verified") {
    throw new AppError("Vendor is not approved", 403);
  }

  const service = serviceId
    ? await prisma.partnerService.findFirst({
        where: { id: serviceId, businessId, isActive: true },
        select: { durationMinutes: true },
      })
    : null;
  if (serviceId && !service) throw new AppError("Service not found for this vendor", 404);

  const duration = service?.durationMinutes ?? slotDurationMinutes ?? 30;
  const slotDuration = Number(duration);
  if (!Number.isInteger(slotDuration) || slotDuration <= 0) {
    throw new AppError("slotDurationMinutes must be a positive integer", 400);
  }

  const availability = await getVendorAvailabilityWindow(businessId, date);
  if (!availability) {
    return { date: dateStr, vendorId: businessId, slotDuration, slots: [] };
  }

  // If the entire day is blocked, everything is unavailable.
  const blocked = await prisma.partnerBlockedDate.findUnique({
    where: { businessId_date: { businessId, date } },
    select: { id: true },
  });
  const isBlocked = Boolean(blocked);

  // Generate slot start-times.
  const grid = generateSlotGrid({
    startTime: availability.startTime,
    endTime: availability.endTime,
    slotDurationMinutes: slotDuration,
  });

  // Subtract already booked slots (pending + confirmed).
  const booked = await prisma.partnerBooking.findMany({
    where: {
      businessId,
      bookingDate: date,
      status: { in: ["pending", "confirmed"] },
      bookingTime: { in: grid },
    },
    select: { bookingTime: true },
  });
  const bookedSet = new Set(booked.map((b) => b.bookingTime));

  const now = new Date();
  const nowMinsUTC = now.getUTCHours() * 60 + now.getUTCMinutes();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const isToday = date.getTime() === todayUTC.getTime();

  const slots = grid.map((time) => {
    const mins = parseTimeToMinutes(time);
    const timeAvailable = !bookedSet.has(time);
    const sameDayAllowed = business.sameDayRequests === true;
    const passesSameDayRule = !isToday || sameDayAllowed || mins > nowMinsUTC;

    return {
      time,
      available: !isBlocked && timeAvailable && passesSameDayRule,
    };
  });

  return {
    date: dateStr,
    vendorId: businessId,
    slotDuration,
    sameDayRequests: business.sameDayRequests,
    slots,
  };
}

async function createBooking(userId, payload) {
  const { vendorId, serviceId, petId, bookingDate, bookingTime, location, notes } = payload;

  const business = await prisma.partnerBusiness.findUnique({
    where: { id: vendorId },
    select: { id: true, verificationStatus: true },
  });
  if (!business) throw new AppError("Vendor not found", 404);
  if (business.verificationStatus !== "verified") {
    throw new AppError("Vendor is not approved", 403);
  }

  const service = await prisma.partnerService.findFirst({
    where: { id: serviceId, businessId: vendorId, isActive: true },
    select: { id: true, name: true, priceType: true, price: true, minPrice: true, durationMinutes: true },
  });
  if (!service) throw new AppError("Service not found for this vendor", 404);

  const pet = await prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
    select: { id: true, name: true, breed: true, age: true, imageUrl: true },
  });
  if (!pet) throw new AppError("Pet not found", 404);

  const normalizedTime = formatMinutesToHHMM(parseTimeToMinutes(bookingTime));
  const dateObj = new Date(bookingDate);

  // Slot-level conflict check.
  const conflict = await prisma.partnerBooking.findFirst({
    where: {
      businessId: vendorId,
      bookingDate: dateObj,
      bookingTime: normalizedTime,
      status: { in: ["pending", "confirmed"] },
    },
    select: { id: true },
  });
  if (conflict) {
    throw new AppError("This time slot is already booked. Please choose another.", 409);
  }

  // Validate that this slot exists in vendor availability grid.
  const slots = await getVendorSlotsInternal(vendorId, bookingDate, { serviceId });
  const slot = slots.slots.find((s) => s.time === normalizedTime);
  if (!slot || !slot.available) {
    throw new AppError("This time slot is not available", 409);
  }

  let price;
  if (service.priceType === "range") {
    price = service.minPrice != null ? Number(service.minPrice) : (service.price != null ? Number(service.price) : 0);
  } else {
    price = service.price != null ? Number(service.price) : 0;
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new AppError("Invalid service price", 400);
  }

  const created = await prisma.partnerBooking.create({
    data: {
      businessId: vendorId,
      customerId: userId,
      petId: pet.id,
      serviceId: service.id,
      serviceName: service.name,
      petName: pet.name,
      petBreed: pet.breed,
      petAge: pet.age != null ? String(pet.age) : null,
      petImageUrl: pet.imageUrl,
      bookingDate: dateObj,
      bookingTime: normalizedTime,
      location: location ?? null,
      price,
      status: "pending",
      servicePhase: "not_started",
      notes: notes ?? null,
      isNew: true,
    },
    include: {
      customer: { select: { id: true, name: true, profileImage: true } },
    },
  });

  return created;
}

const BUSINESS_SELECT = {
  id: true,
  businessName: true,
  profileTitle: true,
  location: true,
  city: true,
  state: true,
  phone: true,
  rating: true,
};

const SERVICE_SELECT = {
  id: true,
  name: true,
  description: true,
  serviceType: true,
  price: true,
  durationMinutes: true,
};

async function getMyBookings(userId, { status } = {}) {
  return prisma.partnerBooking.findMany({
    where: {
      customerId: userId,
      ...(status && { status }),
    },
    include: {
      business: { select: BUSINESS_SELECT },
      service: { select: SERVICE_SELECT },
      payment: { select: { paymentStatus: true, amount: true, paymentMethod: true } },
    },
    orderBy: { bookingDate: "desc" },
  });
}

async function getBookingById(userId, bookingId) {
  const booking = await prisma.partnerBooking.findUnique({
    where: { id: bookingId },
    include: {
      business: { select: BUSINESS_SELECT },
      service: { select: SERVICE_SELECT },
      payment: true,
    },
  });

  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.customerId !== userId) throw new AppError("Access denied", 403);

  return {
    ...booking,
    appointmentId: formatAppointmentId(booking.id),
    dateTimeFormatted: formatDateTime(booking.bookingDate, booking.bookingTime),
  };
}

async function cancelBooking(userId, bookingId) {
  const booking = await prisma.partnerBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, customerId: true, status: true },
  });

  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.customerId !== userId) throw new AppError("Access denied", 403);
  if (["completed", "cancelled", "rejected"].includes(booking.status)) {
    throw new AppError(`Cannot cancel a ${booking.status} booking`, 409);
  }

  // Refund a paid booking (payout only happens on completion, so nothing has been
  // sent to the vendor yet). Refund failure is logged but does not block cancellation.
  if (booking.status === "confirmed") {
    try {
      const connectService = require("./connect.service");
      await connectService.refundForBooking(bookingId);
    } catch (err) {
      logger.error({ event: "BOOKING_REFUND_FAILED", bookingId, error: err.message });
    }
  }

  return prisma.partnerBooking.update({
    where: { id: bookingId },
    data: { status: "cancelled" },
    include: {
      business: { select: { id: true, businessName: true } },
      service: { select: { id: true, name: true } },
    },
  });
}

module.exports = {
  getVendorSlotsInternal,
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
};

