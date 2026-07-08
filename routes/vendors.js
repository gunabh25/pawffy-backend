const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { publicReadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const { requireRole } = require("../middleware/rbac");
const v = require("../validators");
const vendorDiscoveryController = require("../controllers/vendorDiscoveryController");
const businessReviewController = require("../controllers/businessReviewController");
const vendorBookingController = require("../controllers/vendorBookingController");

router.get("/", publicReadLimiter, validate(v.publicVendorsQuerySchema, "query"), vendorDiscoveryController.listVendors);
router.get(
  "/:vendorId/reviews",
  publicReadLimiter,
  validateUuidParams("vendorId"),
  validate(v.businessReviewsQuerySchema, "query"),
  businessReviewController.getVendorReviewsPublic
);

router.get(
  "/:vendorId",
  publicReadLimiter,
  validateUuidParams("vendorId"),
  validate(v.vendorDetailQuerySchema, "query"),
  vendorDiscoveryController.getVendorById
);
router.post(
  "/:vendorId/reviews",
  verifyToken,
  requireRole("customer"),
  writeLimiter,
  validateUuidParams("vendorId"),
  validate(v.createBusinessReviewSchema),
  businessReviewController.createVendorReviewPublic
);

const customerOnly = [verifyToken, requireRole("customer")];

// Customer: browse vendor slots for a specific date (optionally pass serviceId to match slot duration).
router.get(
  "/:vendorId/slots",
  publicReadLimiter,
  validateUuidParams("vendorId"),
  validate(v.vendorSlotsQuerySchema, "query"),
  vendorBookingController.getVendorSlots
);

// Customer: create a vendor request that appears in the vendor inbox as a pending PartnerBooking.
router.post(
  "/:vendorId/requests",
  ...customerOnly,
  writeLimiter,
  validateUuidParams("vendorId"),
  validate(v.vendorCreateRequestSchema),
  vendorBookingController.createVendorRequest
);

module.exports = router;
