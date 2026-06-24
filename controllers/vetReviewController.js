const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../middleware/errors");

// ─── POST /api/vets/:vetId/reviews ────────────────────────────────────────────
exports.createReview = asyncHandler(async (req, res) => {
  const { vetId } = req.params;
  const { rating, comment, bookingId } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: "rating must be between 1 and 5" });
  }

  if (!bookingId) {
    return res.status(400).json({ success: false, message: "bookingId is required to review a vet" });
  }

  const vet = await prisma.vet.findUnique({ where: { id: vetId } });
  if (!vet) return res.status(404).json({ success: false, message: "Vet not found" });

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: req.user.id, vetId, status: "completed" },
  });
  if (!booking) {
    return res.status(400).json({ success: false, message: "No completed booking found for this vet" });
  }

  const existing = await prisma.vetReview.findUnique({
    where: { vetId_userId: { vetId, userId: req.user.id } },
  });
  if (existing) {
    return res.status(409).json({ success: false, message: "You have already reviewed this vet" });
  }

  const review = await prisma.vetReview.create({
    data: { vetId, userId: req.user.id, rating: parseInt(rating), comment, bookingId },
    include: { user: { select: { id: true, name: true, profileImage: true } } },
  });

  const { _avg } = await prisma.vetReview.aggregate({
    where: { vetId },
    _avg: { rating: true },
  });

  await prisma.vet.update({
    where: { id: vetId },
    data: { rating: _avg.rating ? parseFloat(_avg.rating.toFixed(2)) : null },
  });

  res.status(201).json({ success: true, data: review });
});

// ─── GET /api/vets/:vetId/reviews ─────────────────────────────────────────────
exports.getReviews = asyncHandler(async (req, res) => {
  const { vetId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const vet = await prisma.vet.findUnique({ where: { id: vetId } });
  if (!vet) return res.status(404).json({ success: false, message: "Vet not found" });

  const [reviews, total] = await Promise.all([
    prisma.vetReview.findMany({
      where: { vetId },
      include: { user: { select: { id: true, name: true, profileImage: true } } },
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    }),
    prisma.vetReview.count({ where: { vetId } }),
  ]);

  const { _avg } = await prisma.vetReview.aggregate({ where: { vetId }, _avg: { rating: true } });

  res.json({
    success: true,
    data: {
      reviews,
      averageRating: _avg.rating ? parseFloat(_avg.rating.toFixed(2)) : null,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});
