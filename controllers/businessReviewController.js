const asyncHandler = require("../middleware/asyncHandler");
const businessReviewService = require("../services/businessReview.service");

exports.getVendorReviewsPublic = asyncHandler(async (req, res) => {
  const data = await businessReviewService.listPublicReviews(req.params.vendorId, req.query);
  res.json({ success: true, data });
});

exports.createVendorReviewPublic = asyncHandler(async (req, res) => {
  const data = await businessReviewService.createPublicReview(req.params.vendorId, req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

exports.getMyVendorReviews = asyncHandler(async (req, res) => {
  const data = await businessReviewService.listVendorReviews(req.user.id, req.query);
  res.json({ success: true, data });
});

exports.replyToVendorReview = asyncHandler(async (req, res) => {
  const data = await businessReviewService.replyToReview(req.user.id, req.params.reviewId, req.body);
  res.json({ success: true, message: "Review reply saved", data });
});
