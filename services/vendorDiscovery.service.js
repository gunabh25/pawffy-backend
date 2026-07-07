const prisma = require("../config/prisma");
const { getDistanceFromLatLonInKm } = require("../utils/geo");

const SEARCH_RADIUS_KM = 25;

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

function serializeVendor(business, distance = null) {
  return {
    id: business.id,
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

module.exports = {
  listVendors,
};
