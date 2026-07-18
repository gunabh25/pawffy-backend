const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

function formatReview(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    customer: review.customer
      ? {
          id: review.customer.id,
          name: review.customer.name,
          avatar: review.customer.profileImage,
        }
      : undefined,
    business: review.business
      ? {
          id: review.business.id,
          businessName: review.business.businessName,
          avatar: review.business.user?.profileImage || null,
        }
      : undefined,
    booking: review.booking
      ? {
          id: review.booking.id,
          serviceName: review.booking.serviceName,
          petName: review.booking.petName,
          completedAt: review.booking.completedAt,
        }
      : undefined,
  };
}

async function refreshCustomerRating(customerId) {
  const [aggregate, totalReviews] = await Promise.all([
    prisma.customerReview.aggregate({
      where: { customerId },
      _avg: { rating: true },
    }),
    prisma.customerReview.count({ where: { customerId } }),
  ]);

  await prisma.user.update({
    where: { id: customerId },
    data: {
      customerRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
      customerReviewCount: totalReviews,
    },
  });

  return {
    averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : 0,
    totalReviews,
  };
}

async function createCustomerReview(vendorUserId, { bookingId, rating, comment }) {
  const business = await prisma.partnerBusiness.findUnique({
    where: { userId: vendorUserId },
    select: { id: true },
  });
  if (!business) throw new AppError("Vendor business profile not found", 404);

  const booking = await prisma.partnerBooking.findFirst({
    where: {
      id: bookingId,
      businessId: business.id,
      status: "completed",
    },
  });
  if (!booking) {
    throw new AppError("No completed booking found for this request", 400);
  }

  const existing = await prisma.customerReview.findUnique({ where: { bookingId } });
  if (existing) {
    throw new AppError("You have already reviewed this customer for this booking", 409);
  }

  const review = await prisma.customerReview.create({
    data: {
      businessId: business.id,
      customerId: booking.customerId,
      bookingId,
      rating: Number(rating),
      comment: comment || null,
    },
    include: {
      customer: { select: { id: true, name: true, profileImage: true } },
      business: {
        select: {
          id: true,
          businessName: true,
          user: { select: { profileImage: true } },
        },
      },
      booking: { select: { id: true, serviceName: true, petName: true, completedAt: true } },
    },
  });

  await refreshCustomerRating(booking.customerId);
  return formatReview(review);
}

async function listReviewsWrittenByVendor(vendorUserId, { page = 1, limit = 20 } = {}) {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 20;

  const business = await prisma.partnerBusiness.findUnique({
    where: { userId: vendorUserId },
    select: { id: true },
  });
  if (!business) throw new AppError("Vendor business profile not found", 404);

  const skip = (pageNumber - 1) * limitNumber;
  const [reviews, total] = await Promise.all([
    prisma.customerReview.findMany({
      where: { businessId: business.id },
      include: {
        customer: { select: { id: true, name: true, profileImage: true } },
        booking: { select: { id: true, serviceName: true, petName: true, completedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNumber,
    }),
    prisma.customerReview.count({ where: { businessId: business.id } }),
  ]);

  return {
    totalReviews: total,
    reviews: reviews.map(formatReview),
    page: pageNumber,
    pages: Math.ceil((total || 0) / limitNumber),
  };
}

async function listReviewsAboutCustomer(customerId, { page = 1, limit = 20 } = {}) {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 20;

  const user = await prisma.user.findUnique({
    where: { id: customerId },
    select: { id: true, customerRating: true, customerReviewCount: true },
  });
  if (!user) throw new AppError("User not found", 404);

  const skip = (pageNumber - 1) * limitNumber;
  const [reviews, total] = await Promise.all([
    prisma.customerReview.findMany({
      where: { customerId },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            user: { select: { profileImage: true } },
          },
        },
        booking: { select: { id: true, serviceName: true, petName: true, completedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNumber,
    }),
    prisma.customerReview.count({ where: { customerId } }),
  ]);

  return {
    averageRating: user.customerRating != null ? Number(user.customerRating) : 0,
    totalReviews: total || user.customerReviewCount,
    reviews: reviews.map(formatReview),
    page: pageNumber,
    pages: Math.ceil((total || 0) / limitNumber),
  };
}

module.exports = {
  createCustomerReview,
  listReviewsWrittenByVendor,
  listReviewsAboutCustomer,
  refreshCustomerRating,
};
