const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { getRandomPetCareQuote } = require("../utils/quotes");
const { getDistanceFromLatLonInKm } = require("../utils/geo");
const { sanitizeUser } = require("../utils/auth");

const PARTNER_RADIUS_KM = 25;

const USER_SELECT = {
  id: true, name: true, email: true, phone: true, role: true,
  profileImage: true, address: true, city: true, state: true,
  latitude: true, longitude: true,
};

async function getPartnersNearby(latitude, longitude) {
  const partners = await prisma.user.findMany({
    where: { role: "partner", latitude: { not: null }, longitude: { not: null } },
    select: USER_SELECT,
  });

  return partners
    .map((partner) => {
      const distance = getDistanceFromLatLonInKm(
        latitude,
        longitude,
        Number(partner.latitude),
        Number(partner.longitude)
      );
      return { ...partner, distance };
    })
    .filter((p) => p.distance <= PARTNER_RADIUS_KM)
    .sort((a, b) => a.distance - b.distance);
}

async function getUserSummary(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });
  return user ? sanitizeUser(user) : null;
}

async function getUserNotifications(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

async function getActiveCategories() {
  return prisma.category.findMany({
    where: { status: true },
    orderBy: { sortOrder: "asc" },
  });
}

async function getBannerByPlatform(platform) {
  if (!platform) throw new AppError("Platform is required (web/app)", 400);

  const normalized = platform.toLowerCase();
  const banners = await prisma.banner.findMany({ where: { isActive: true } });

  const banner = banners.find((b) =>
    (normalized === "web" && b.bannerWeb) || (normalized === "app" && b.bannerApp)
  );

  if (!banner) throw new AppError("Banner not found.", 404);
  return banner;
}

async function getDashboard(userId, { latitude, longitude, platform } = {}) {
  const response = { success: true, data: {} };

  if (userId) {
    response.data.user = await getUserSummary(userId);
    response.data.notifications = await getUserNotifications(userId);
  }

  if (latitude != null && longitude != null) {
    response.data.partnersNearby = await getPartnersNearby(latitude, longitude);
  }

  response.data.categories = await getActiveCategories();

  if (platform) {
    try {
      response.data.banner = await getBannerByPlatform(platform);
    } catch (err) {
      if (err.status !== 404) throw err;
      response.data.banner = null;
    }
  } else {
    response.data.banner = null;
  }

  response.data.quote = getRandomPetCareQuote();
  return response;
}

module.exports = {
  getDashboard,
  getUserSummary,
  getPartnersNearby,
  getUserNotifications,
  getActiveCategories,
  getBannerByPlatform,
};
