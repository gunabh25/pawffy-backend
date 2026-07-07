const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

function formatReview(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    reply: review.replyContent,
    repliedAt: review.repliedAt,
    user: review.user ? {
      id: review.user.id,
      name: review.user.name,
      avatar: review.user.profileImage,
    } : undefined,
    booking: review.booking ? {
      id: review.booking.id,
      serviceName: review.booking.serviceName,
      petName: review.booking.petName,
      completedAt: review.booking.completedAt,
    } : undefined,
  };
}

async function refreshBusinessRating(businessId) {
  const [aggregate, totalReviews] = await Promise.all([
    prisma.businessReview.aggregate({
      where: { businessId },
      _avg: { rating: true },
    }),
    prisma.businessReview.count({ where: { businessId } }),
  ]);

  await prisma.partnerBusiness.update({
    where: { id: businessId },
    data: {
      rating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
      reviewCount: totalReviews,
    },
  });

  return {
    averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : 0,
    totalReviews,
  };
}

async function listPublicReviews(vendorId, { page = 1, limit = 20 } = {}) {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 20;
  const business = await prisma.partnerBusiness.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      verificationStatus: true,
      rating: true,
      reviewCount: true,
    },
  });

  if (!business || business.verificationStatus !== "verified") {
    throw new AppError("Vendor not found", 404);
  }

  const skip = (pageNumber - 1) * limitNumber;
  const [reviews, total] = await Promise.all([
    prisma.businessReview.findMany({
      where: { businessId: vendorId },
      include: {
        user: { select: { id: true, name: true, profileImage: true } },
        booking: { select: { id: true, serviceName: true, petName: true, completedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNumber,
    }),
    prisma.businessReview.count({ where: { businessId: vendorId } }),
  ]);

  return {
    averageRating: business.rating != null ? Number(business.rating) : 0,
    totalReviews: total || business.reviewCount,
    reviews: reviews.map(formatReview),
    page: pageNumber,
    pages: Math.ceil((total || 0) / limitNumber),
  };
}

async function createPublicReview(vendorId, userId, { rating, comment, bookingId }) {
  const business = await prisma.partnerBusiness.findUnique({
    where: { id: vendorId },
    select: { id: true, verificationStatus: true },
  });
  if (!business || business.verificationStatus !== "verified") {
    throw new AppError("Vendor not found", 404);
  }

  const booking = await prisma.partnerBooking.findFirst({
    where: {
      id: bookingId,
      businessId: vendorId,
      customerId: userId,
      status: "completed",
    },
  });
  if (!booking) {
    throw new AppError("No completed booking found for this vendor", 400);
  }

  const existing = await prisma.businessReview.findUnique({ where: { bookingId } });
  if (existing) {
    throw new AppError("You have already reviewed this booking", 409);
  }

  const review = await prisma.businessReview.create({
    data: {
      businessId: vendorId,
      userId,
      bookingId,
      rating: Number(rating),
      comment: comment || null,
    },
    include: {
      user: { select: { id: true, name: true, profileImage: true } },
      booking: { select: { id: true, serviceName: true, petName: true, completedAt: true } },
    },
  });

  await refreshBusinessRating(vendorId);
  return formatReview(review);
}

async function listVendorReviews(userId, { page = 1, limit = 20 } = {}) {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 20;
  const business = await prisma.partnerBusiness.findUnique({
    where: { userId },
    select: { id: true, rating: true, reviewCount: true },
  });
  if (!business) throw new AppError("Vendor business profile not found", 404);

  const skip = (pageNumber - 1) * limitNumber;
  const [reviews, total] = await Promise.all([
    prisma.businessReview.findMany({
      where: { businessId: business.id },
      include: {
        user: { select: { id: true, name: true, profileImage: true } },
        booking: { select: { id: true, serviceName: true, petName: true, completedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNumber,
    }),
    prisma.businessReview.count({ where: { businessId: business.id } }),
  ]);

  return {
    averageRating: business.rating != null ? Number(business.rating) : 0,
    totalReviews: total || business.reviewCount,
    reviews: reviews.map(formatReview),
    page: pageNumber,
    pages: Math.ceil((total || 0) / limitNumber),
  };
}

async function replyToReview(userId, reviewId, { replyContent }) {
  const business = await prisma.partnerBusiness.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!business) throw new AppError("Vendor business profile not found", 404);

  const review = await prisma.businessReview.findFirst({
    where: { id: reviewId, businessId: business.id },
  });
  if (!review) throw new AppError("Review not found", 404);

  const updated = await prisma.businessReview.update({
    where: { id: reviewId },
    data: {
      replyContent,
      repliedAt: new Date(),
    },
    include: {
      user: { select: { id: true, name: true, profileImage: true } },
      booking: { select: { id: true, serviceName: true, petName: true, completedAt: true } },
    },
  });

  return formatReview(updated);
}

module.exports = {
  listPublicReviews,
  createPublicReview,
  listVendorReviews,
  replyToReview,
  refreshBusinessRating,
};
