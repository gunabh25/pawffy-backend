const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const documentUpload = require("../middleware/documentUpload");
const { validateUuidParams } = require("../middleware/accessControl");
const { uploadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const ctrl = require("../controllers/vendorOnboardingController");

const partnerOnly = [verifyToken, requireRole("partner")];
const adminOnly = [verifyToken, requireRole("admin")];

// ─── Onboarding (matches vendor app UI flow) ─────────────────────────────────
router.get("/onboarding", ...partnerOnly, ctrl.getOnboarding);
router.put("/onboarding/business", ...partnerOnly, writeLimiter, validate(v.vendorBusinessSchema), ctrl.updateBusiness);

router.post("/onboarding/services", ...partnerOnly, writeLimiter, validate(v.vendorServiceSchema), ctrl.createService);
router.put(
  "/onboarding/services/:id",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("id"),
  validate(v.vendorServiceUpdateSchema),
  ctrl.updateService
);
router.delete(
  "/onboarding/services/:id",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("id"),
  ctrl.deleteService
);

router.put(
  "/onboarding/availability",
  ...partnerOnly,
  writeLimiter,
  validate(v.vendorAvailabilitySchema),
  ctrl.updateAvailability
);

router.post(
  "/onboarding/documents",
  ...partnerOnly,
  uploadLimiter,
  documentUpload.single("document"),
  ctrl.uploadDocument
);
router.delete(
  "/onboarding/documents/:id",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("id"),
  ctrl.deleteDocument
);

router.get("/onboarding/review", ...partnerOnly, ctrl.getReview);
router.post("/onboarding/submit", ...partnerOnly, writeLimiter, ctrl.submitOnboarding);

// ─── Dashboard (allowed while verification is pending) ───────────────────────
router.get("/dashboard", ...partnerOnly, ctrl.getDashboard);

// ─── Admin verification ──────────────────────────────────────────────────────
router.get("/admin/pending", ...adminOnly, ctrl.listPendingApplications);
router.patch(
  "/admin/:businessId/review",
  ...adminOnly,
  writeLimiter,
  validateUuidParams("businessId"),
  validate(v.vendorReviewSchema),
  ctrl.reviewApplication
);

module.exports = router;
