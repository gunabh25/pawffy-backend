const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const messageService = require("./message.service");

const STATUS_LABELS = {
  incomplete: "Incomplete",
  pending: "Under Review",
  verified: "Approved",
  rejected: "Rejected",
};

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError("date must be in YYYY-MM-DD format", 400);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function periodRange(period = "month") {
  const now = new Date();
  const currentStart = new Date(now);
  const previousStart = new Date(now);
  const previousEnd = new Date(now);

  if (period === "week") {
    currentStart.setDate(now.getDate() - 7);
    previousEnd.setTime(currentStart.getTime() - 1);
    previousStart.setDate(previousEnd.getDate() - 7);
  } else if (period === "year") {
    currentStart.setFullYear(now.getFullYear(), 0, 1);
    previousStart.setFullYear(now.getFullYear() - 1, 0, 1);
    previousEnd.setFullYear(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  } else {
    currentStart.setDate(1);
    currentStart.setHours(0, 0, 0, 0);
    previousStart.setMonth(now.getMonth() - 1, 1);
    previousStart.setHours(0, 0, 0, 0);
    previousEnd.setMonth(now.getMonth(), 0, 23, 59, 59, 999);
  }

  return { currentStart, previousStart, previousEnd, now };
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatRelativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatBookingDate(date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function applicationStatus(business) {
  return {
    status: business.verificationStatus,
    label: STATUS_LABELS[business.verificationStatus] || business.verificationStatus,
    isVerified: business.verificationStatus === "verified",
    isPending: business.verificationStatus === "pending",
    isRejected: business.verificationStatus === "rejected",
    rejectionReason: business.rejectionReason,
    message: business.verificationStatus === "pending"
      ? "Your application is under review. You will start receiving Requests once your application is approved."
      : business.verificationStatus === "rejected"
        ? business.rejectionReason || "Your application was rejected."
        : business.verificationStatus === "verified"
          ? "Your business is approved and live."
          : "Complete onboarding to go live.",
  };
}

function serializeService(service) {
  const price = service.priceType === "range"
    ? Number(service.minPrice)
    : Number(service.price);
  const priceDisplay = service.priceType === "range"
    ? `$${Number(service.minPrice)} - $${Number(service.maxPrice)}`
    : `$${Number(service.price)}`;

  return {
    id: service.id,
    serviceType: service.serviceType,
    name: service.name,
    description: service.description,
    inclusions: service.inclusions,
    durationMinutes: service.durationMinutes,
    priceType: service.priceType,
    price,
    minPrice: service.minPrice != null ? Number(service.minPrice) : null,
    maxPrice: service.maxPrice != null ? Number(service.maxPrice) : null,
    priceDisplay,
    serviceLocation: service.serviceLocation,
    isActive: service.isActive,
  };
}

function serializeBooking(booking) {
  return {
    id: booking.id,
    serviceName: booking.serviceName,
    pet: {
      id: booking.petId,
      name: booking.petName,
      breed: booking.petBreed,
      age: booking.petAge,
      imageUrl: booking.petImageUrl,
      details: [booking.petBreed, booking.petAge].filter(Boolean).join(" • ") || null,
    },
    bookingDate: booking.bookingDate,
    bookingDateLabel: formatBookingDate(booking.bookingDate),
    bookingTime: booking.bookingTime,
    location: booking.location,
    price: Number(booking.price),
    priceDisplay: `$${Number(booking.price)}`,
    status: booking.status,
    statusLabel: booking.status.charAt(0).toUpperCase() + booking.status.slice(1),
    isNew: booking.isNew,
    notes: booking.notes,
    customer: booking.customer
      ? { id: booking.customer.id, name: booking.customer.name, profileImage: booking.customer.profileImage }
      : undefined,
    createdAt: booking.createdAt,
  };
}

async function getBusinessOrThrow(userId) {
  const business = await prisma.partnerBusiness.findUnique({
    where: { userId },
    include: {
      services: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          profileImage: true,
          city: true,
          state: true,
          address: true,
        },
      },
    },
  });

  if (!business) throw new AppError("Vendor business profile not found", 404);
  return business;
}

async function unreadNotificationCount(userId) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

async function countByStatus(businessId, status, extraWhere = {}) {
  return prisma.partnerBooking.count({
    where: { businessId, status, ...extraWhere },
  });
}

async function sumEarnings(businessId, from, to) {
  const result = await prisma.partnerBooking.aggregate({
    where: {
      businessId,
      status: "completed",
      bookingDate: { gte: from, lte: to },
    },
    _sum: { price: true },
  });
  return Number(result._sum.price || 0);
}

async function getHome(userId) {
  const business = await getBusinessOrThrow(userId);
  const today = startOfDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const appStatus = applicationStatus(business);
  const [unreadCount, pendingCount, todayScheduleCount, todayEarnings, yesterdayEarnings, upcoming] = await Promise.all([
    unreadNotificationCount(userId),
    countByStatus(business.id, "pending"),
    prisma.partnerBooking.count({
      where: {
        businessId: business.id,
        bookingDate: { gte: today, lt: tomorrow },
        status: { in: ["pending", "confirmed"] },
      },
    }),
    sumEarnings(business.id, today, endOfDay()),
    sumEarnings(business.id, yesterday, endOfDay(yesterday)),
    prisma.partnerBooking.findMany({
      where: {
        businessId: business.id,
        status: { in: ["pending", "confirmed"] },
        bookingDate: { gte: today },
      },
      include: {
        customer: { select: { id: true, name: true, profileImage: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { bookingTime: "asc" }],
      take: 10,
    }),
  ]);

  const earningsChange = percentChange(todayEarnings, yesterdayEarnings);

  return {
    header: {
      name: business.contactName || business.user.name,
      businessName: business.businessName,
      location: business.location || [business.city || business.user.city, business.state || business.user.state].filter(Boolean).join(", "),
      city: business.city || business.user.city,
      state: business.state || business.user.state,
      profileImage: business.user.profileImage,
      isOnline: business.isOnline,
      unreadNotifications: unreadCount,
    },
    applicationStatus: appStatus,
    banner: {
      newRequestsCount: pendingCount,
      message: pendingCount > 0
        ? `You have ${pendingCount} new request${pendingCount === 1 ? "" : "s"} waiting for your response`
        : "No new requests right now",
    },
    todayAtAGlance: {
      schedule: {
        count: todayScheduleCount,
        label: `${todayScheduleCount} Booking${todayScheduleCount === 1 ? "" : "s"}`,
      },
      newRequests: {
        count: pendingCount,
        label: pendingCount > 0 ? "Action required" : "No action needed",
      },
      earnings: {
        amount: todayEarnings,
        display: `$${todayEarnings}`,
        changePercent: earningsChange,
        changeLabel: `${earningsChange >= 0 ? "+" : ""}${earningsChange}% ${earningsChange >= 0 ? "increase" : "decrease"}`,
      },
      rating: {
        average: business.rating != null ? Number(business.rating) : 0,
        reviewCount: business.reviewCount,
      },
    },
    upcomingBookings: upcoming.map(serializeBooking),
    requestsAvailable: appStatus.isVerified,
  };
}

async function setOnlineStatus(userId, isOnline) {
  const business = await getBusinessOrThrow(userId);
  const updated = await prisma.partnerBusiness.update({
    where: { id: business.id },
    data: { isOnline: Boolean(isOnline) },
    select: { id: true, isOnline: true },
  });
  return updated;
}

async function getRequests(userId, { status = "pending", search } = {}) {
  const business = await getBusinessOrThrow(userId);
  const appStatus = applicationStatus(business);

  if (!appStatus.isVerified) {
    return {
      available: false,
      applicationStatus: appStatus,
      message: appStatus.message,
      data: [],
      counts: { pending: 0, upcoming: 0, completed: 0, canceled: 0 },
    };
  }

  const today = startOfDay();
  const statusMap = {
    pending: { status: "pending" },
    upcoming: {
      status: "confirmed",
      bookingDate: { gte: today },
    },
    completed: { status: "completed" },
    canceled: { status: { in: ["cancelled", "rejected"] } },
    cancelled: { status: { in: ["cancelled", "rejected"] } },
  };

  const where = {
    businessId: business.id,
    ...(statusMap[status] || statusMap.pending),
  };

  if (search) {
    where.OR = [
      { petName: { contains: search, mode: "insensitive" } },
      { serviceName: { contains: search, mode: "insensitive" } },
      { location: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [bookings, pending, upcoming, completed, canceled] = await Promise.all([
    prisma.partnerBooking.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, profileImage: true, phone: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { bookingTime: "asc" }],
    }),
    countByStatus(business.id, "pending"),
    prisma.partnerBooking.count({
      where: { businessId: business.id, status: "confirmed", bookingDate: { gte: today } },
    }),
    countByStatus(business.id, "completed"),
    prisma.partnerBooking.count({
      where: { businessId: business.id, status: { in: ["cancelled", "rejected"] } },
    }),
  ]);

  return {
    available: true,
    applicationStatus: appStatus,
    status,
    counts: { pending, upcoming, completed, canceled },
    data: bookings.map(serializeBooking),
  };
}

async function respondToRequest(userId, bookingId, action) {
  const business = await getBusinessOrThrow(userId);
  if (business.verificationStatus !== "verified") {
    throw new AppError("You can respond to requests only after approval", 403);
  }

  const booking = await prisma.partnerBooking.findFirst({
    where: { id: bookingId, businessId: business.id },
    include: { customer: { select: { id: true, name: true, profileImage: true } } },
  });
  if (!booking) throw new AppError("Request not found", 404);
  if (booking.status !== "pending") {
    throw new AppError("Only pending requests can be accepted or rejected", 400);
  }

  const status = action === "accept" ? "confirmed" : "rejected";
  const updated = await prisma.partnerBooking.update({
    where: { id: bookingId },
    data: {
      status,
      isNew: false,
      respondedAt: new Date(),
    },
    include: { customer: { select: { id: true, name: true, profileImage: true } } },
  });

  await prisma.notification.create({
    data: {
      userId: booking.customerId,
      title: action === "accept" ? "Request accepted" : "Request declined",
      message: action === "accept"
        ? `${business.businessName || "A partner"} accepted your ${booking.serviceName} request.`
        : `${business.businessName || "A partner"} declined your ${booking.serviceName} request.`,
      type: "booking",
    },
  });

  return serializeBooking(updated);
}

async function getCalendar(userId, dateStr) {
  const business = await getBusinessOrThrow(userId);
  const date = dateStr ? parseDateOnly(dateStr) : startOfDay();
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);

  const [pendingCount, schedule, blocked] = await Promise.all([
    countByStatus(business.id, "pending"),
    prisma.partnerBooking.findMany({
      where: {
        businessId: business.id,
        bookingDate: { gte: date, lt: next },
        status: { in: ["pending", "confirmed", "completed"] },
      },
      include: {
        customer: { select: { id: true, name: true, profileImage: true } },
      },
      orderBy: { bookingTime: "asc" },
    }),
    prisma.partnerBlockedDate.findUnique({
      where: {
        businessId_date: { businessId: business.id, date },
      },
    }),
  ]);

  return {
    date: dateStr || date.toISOString().slice(0, 10),
    isOnline: business.isOnline,
    isBlocked: Boolean(blocked),
    blockedReason: blocked?.reason || null,
    banner: {
      newRequestsCount: pendingCount,
      message: pendingCount > 0
        ? `You have ${pendingCount} new request${pendingCount === 1 ? "" : "s"} waiting for your response`
        : "No new requests right now",
    },
    schedule: schedule.map(serializeBooking),
  };
}

async function listBlockedDates(userId) {
  const business = await getBusinessOrThrow(userId);
  const dates = await prisma.partnerBlockedDate.findMany({
    where: { businessId: business.id, date: { gte: startOfDay() } },
    orderBy: { date: "asc" },
  });
  return dates.map((d) => ({
    id: d.id,
    date: d.date,
    reason: d.reason,
  }));
}

async function addBlockedDate(userId, { date, reason }) {
  const business = await getBusinessOrThrow(userId);
  const day = parseDateOnly(date);

  try {
    const created = await prisma.partnerBlockedDate.create({
      data: {
        businessId: business.id,
        date: day,
        reason: reason || null,
      },
    });
    return { id: created.id, date: created.date, reason: created.reason };
  } catch (err) {
    if (err.code === "P2002") throw new AppError("This date is already blocked", 409);
    throw err;
  }
}

async function removeBlockedDate(userId, blockedDateId) {
  const business = await getBusinessOrThrow(userId);
  const existing = await prisma.partnerBlockedDate.findFirst({
    where: { id: blockedDateId, businessId: business.id },
  });
  if (!existing) throw new AppError("Blocked date not found", 404);

  await prisma.partnerBlockedDate.delete({ where: { id: blockedDateId } });
  return { id: blockedDateId };
}

async function getProfile(userId, period = "month") {
  const business = await getBusinessOrThrow(userId);
  const { currentStart, previousStart, previousEnd, now } = periodRange(period);

  const [
    currentBookings,
    previousBookings,
    currentEarnings,
    previousEarnings,
    customerGroups,
    unreadCount,
  ] = await Promise.all([
    prisma.partnerBooking.count({
      where: {
        businessId: business.id,
        status: { in: ["confirmed", "completed"] },
        createdAt: { gte: currentStart, lte: now },
      },
    }),
    prisma.partnerBooking.count({
      where: {
        businessId: business.id,
        status: { in: ["confirmed", "completed"] },
        createdAt: { gte: previousStart, lte: previousEnd },
      },
    }),
    sumEarnings(business.id, currentStart, now),
    sumEarnings(business.id, previousStart, previousEnd),
    prisma.partnerBooking.groupBy({
      by: ["customerId"],
      where: {
        businessId: business.id,
        status: { in: ["confirmed", "completed"] },
      },
      _count: { _all: true },
    }),
    unreadNotificationCount(userId),
  ]);

  const totalCustomers = customerGroups.length;
  const repeatCustomers = customerGroups.filter((g) => g._count._all > 1).length;
  const repeatRate = totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;
  const prevRepeatRate = 0;

  const membershipLabel = business.membershipPlan === "pro" ? "Pro Member" : "Free Member";
  const membershipValidTill = business.membershipExpiresAt
    ? new Date(business.membershipExpiresAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : null;

  return {
    profile: {
      name: business.contactName || business.user.name,
      title: business.profileTitle || business.services.map((s) => s.serviceType).slice(0, 2)
        .map((t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
        .join(" & ") || "Pet Care Professional",
      phone: business.phone || business.user.phone,
      email: business.user.email,
      location: business.location || [business.city || business.user.city, business.state || business.user.state].filter(Boolean).join(", "),
      city: business.city || business.user.city,
      state: business.state || business.user.state,
      profileImage: business.user.profileImage,
      businessName: business.businessName,
      description: business.description,
    },
    applicationStatus: applicationStatus(business),
    membership: {
      plan: business.membershipPlan,
      label: membershipLabel,
      expiresAt: business.membershipExpiresAt,
      validTill: membershipValidTill,
      isPro: business.membershipPlan === "pro",
    },
    performance: {
      period,
      totalBookings: {
        count: currentBookings,
        changePercent: percentChange(currentBookings, previousBookings),
      },
      totalEarning: {
        amount: currentEarnings,
        display: `$${currentEarnings.toLocaleString("en-US")}`,
        changePercent: percentChange(currentEarnings, previousEarnings),
      },
      rating: {
        average: business.rating != null ? Number(business.rating) : 0,
        reviewCount: business.reviewCount,
      },
      repeatClients: {
        percent: repeatRate,
        changePercent: percentChange(repeatRate, prevRepeatRate),
      },
    },
    services: business.services.map(serializeService),
    unreadNotifications: unreadCount,
    isOnline: business.isOnline,
  };
}

async function updateProfile(userId, data) {
  const business = await getBusinessOrThrow(userId);

  await prisma.$transaction([
    prisma.partnerBusiness.update({
      where: { id: business.id },
      data: {
        ...(data.contactName !== undefined && { contactName: data.contactName }),
        ...(data.businessName !== undefined && { businessName: data.businessName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.profileTitle !== undefined && { profileTitle: data.profileTitle }),
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.contactName !== undefined && { name: data.contactName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.location !== undefined && { address: data.location }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.profileImage !== undefined && { profileImage: data.profileImage }),
      },
    }),
  ]);

  return getProfile(userId);
}

async function listServices(userId) {
  const business = await getBusinessOrThrow(userId);
  return business.services.map(serializeService);
}

async function getChats(userId, search) {
  const conversations = await messageService.getConversations(userId, search);
  return conversations.map((c) => ({
    id: c.id,
    name: c.otherUser?.name || "Unknown",
    avatar: c.otherUser?.profileImage || null,
    otherUser: c.otherUser,
    lastMessage: c.lastMessage,
    timeAgo: formatRelativeTime(c.updatedAt),
    updatedAt: c.updatedAt,
    isUnread: (c.unreadCount || 0) > 0,
    unreadCount: c.unreadCount || 0,
  }));
}

async function getUnreadNotifications(userId) {
  const count = await unreadNotificationCount(userId);
  return { count, hasUnread: count > 0 };
}

module.exports = {
  getHome,
  setOnlineStatus,
  getRequests,
  respondToRequest,
  getCalendar,
  listBlockedDates,
  addBlockedDate,
  removeBlockedDate,
  getProfile,
  updateProfile,
  listServices,
  getChats,
  getUnreadNotifications,
};
