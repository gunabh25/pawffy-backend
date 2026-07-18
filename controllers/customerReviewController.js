const asyncHandler = require("../middleware/asyncHandler");
const customerReviewService = require("../services/customerReview.service");

/** Vendor reviews a customer after a completed booking */
exports.createCustomerReview = asyncHandler(async (req, res) => {
  const data = await customerReviewService.createCustomerReview(req.user.id, req.body);
  res.status(201).json({ success: true, message: "Customer review submitted", data });
});

/** Vendor lists reviews they wrote about customers */
exports.getMyCustomerReviews = asyncHandler(async (req, res) => {
  const data = await customerReviewService.listReviewsWrittenByVendor(req.user.id, req.query);
  res.json({ success: true, data });
});

/** Customer lists reviews vendors left about them */
exports.getMyReceivedReviews = asyncHandler(async (req, res) => {
  const data = await customerReviewService.listReviewsAboutCustomer(req.user.id, req.query);
  res.json({ success: true, data });
});
