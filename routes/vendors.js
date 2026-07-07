const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { publicReadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const vendorDiscoveryController = require("../controllers/vendorDiscoveryController");
const businessReviewController = require("../controllers/businessReviewController");

router.get("/", publicReadLimiter, validate(v.publicVendorsQuerySchema, "query"), vendorDiscoveryController.listVendors);
router.get(
  "/:vendorId/reviews",
  publicReadLimiter,
  validateUuidParams("vendorId"),
  validate(v.businessReviewsQuerySchema, "query"),
  businessReviewController.getVendorReviewsPublic
);
router.post(
  "/:vendorId/reviews",
  verifyToken,
  writeLimiter,
  validateUuidParams("vendorId"),
  validate(v.createBusinessReviewSchema),
  businessReviewController.createVendorReviewPublic
);

module.exports = router;
