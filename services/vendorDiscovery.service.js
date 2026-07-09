const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { getDistanceFromLatLonInKm } = require("../utils/geo");

const SEARCH_RADIUS_KM = 25;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function serializeService(service) {
  return {
    id: service.id,
    name: service.name,
    price: service.price != null ? Number(service.price) : null,
    minPrice: service.minPrice != null ? Number(service.minPrice) : null,
    maxPrice: service.maxPrice != null ? Number(service.maxPrice) : null,
    priceType: service.priceType,
    serviceType: service.serviceType,
    durationMinutes: service.durationMinutes,
  };
}

function formatAvailabilitySummary(availability, sameDayRequests) {
  if (!availability.length) {
    return { workingDays: [], startTime: null, endTime: null, sameDayRequests, label: null };
  }

  const active = availability.filter((d) => d.isAvailable);
  const workingDays = active.map((d) => d.dayOfWeek);
  const startTime = active[0]?.startTime || null;
  const endTime = active[0]?.endTime || null;

  let label = null;
  if (workingDays.length && startTime && endTime) {
    const indices = workingDays.map((d) => DAYS.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
    const contiguous = indices.length > 1 && indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
    const dayLabel = workingDays.length === 1
      ? workingDays[0]
      : contiguous
        ? `${DAYS[indices[0]]}-${DAYS[indices[indices.length - 1]]}`
        : workingDays.join(", ");
    label = `${dayLabel}, ${startTime} - ${endTime}`;
  }

  return { workingDays, startTime, endTime, sameDayRequests, label };
}

function serializeAvailability(availability) {
  return availability.map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    isAvailable: slot.isAvailable,
  }));
}

function serializeVendor(business, distance = null) {
  return {
    id: business.id,
    userId: business.userId,
    businessName: business.businessName,
    contactName: business.contactName,
    profileImage: business.user.profileImage,
    location: business.location,
    city: business.city,
    state: business.state,
    rating: business.rating != null ? Number(business.rating) : 0,
    reviewCount: business.reviewCount,
    isOnline: business.isOnline,
    sameDayRequests: business.sameDayRequests,
    distanceKm: distance,
    services: business.services.map(serializeService),
    availability: serializeAvailability(business.availability || []),
    timings: formatAvailabilitySummary(business.availability || [], business.sameDayRequests),
  };
}

async function listVendors(filters) {
  const {
    serviceType,
    city,
    latitude,
    longitude,
    isOnline,
  } = filters;

  const businesses = await prisma.partnerBusiness.findMany({
    where: {
      verificationStatus: "verified",
      ...(typeof isOnline === "boolean" ? { isOnline } : {}),
      ...(city ? {
        OR: [
          { city: { contains: city, mode: "insensitive" } },
          { location: { contains: city, mode: "insensitive" } },
        ],
      } : {}),
      ...(serviceType ? {
        services: {
          some: {
            serviceType,
            isActive: true,
          },
        },
      } : {}),
    },
    include: {
      user: {
        select: {
          profileImage: true,
          latitude: true,
          longitude: true,
        },
      },
      availability: {
        orderBy: { dayOfWeek: "asc" },
      },
      services: {
        where: {
          isActive: true,
          ...(serviceType ? { serviceType } : {}),
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [
      { isOnline: "desc" },
      { rating: "desc" },
      { reviewCount: "desc" },
    ],
  });

  const hasGeo = latitude != null && longitude != null;

  return businesses
    .map((business) => {
      let distanceKm = null;
      if (hasGeo && business.user.latitude != null && business.user.longitude != null) {
        distanceKm = Number(getDistanceFromLatLonInKm(
          latitude,
          longitude,
          Number(business.user.latitude),
          Number(business.user.longitude)
        ).toFixed(2));
      }
      return serializeVendor(business, distanceKm);
    })
    .filter((vendor) => !hasGeo || vendor.distanceKm == null || vendor.distanceKm <= SEARCH_RADIUS_KM)
    .sort((a, b) => {
      if (hasGeo && a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });
}

async function getVendorById(vendorId, { latitude, longitude } = {}) {
  const hasGeo = latitude != null && longitude != null;

  const business = await prisma.partnerBusiness.findFirst({
    where: {
      id: vendorId,
      verificationStatus: "verified",
    },
    include: {
      user: {
        select: {
          profileImage: true,
          latitude: true,
          longitude: true,
        },
      },
      availability: {
        orderBy: { dayOfWeek: "asc" },
      },
      services: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!business) {
    throw new AppError("Vendor not found", 404);
  }

  let distanceKm = null;
  if (hasGeo && business.user.latitude != null && business.user.longitude != null) {
    distanceKm = Number(getDistanceFromLatLonInKm(
      latitude,
      longitude,
      Number(business.user.latitude),
      Number(business.user.longitude)
    ).toFixed(2));
  }

  return serializeVendor(business, distanceKm);
}

module.exports = {
  listVendors,
  getVendorById,
};
