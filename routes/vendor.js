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
const appCtrl = require("../controllers/vendorAppController");

const partnerOnly = [verifyToken, requireRole("partner")];
const adminOnly = [verifyToken, requireRole("admin")];

// ─── Main app screens (Home, Requests, Calendar, Profile, Chats) ─────────────
router.get("/home", ...partnerOnly, appCtrl.getHome);
router.patch("/status", ...partnerOnly, writeLimiter, validate(v.vendorOnlineStatusSchema), appCtrl.setOnlineStatus);

router.get("/requests", ...partnerOnly, validate(v.vendorRequestsQuerySchema, "query"), appCtrl.getRequests);
router.post("/requests/:id/accept", ...partnerOnly, writeLimiter, validateUuidParams("id"), appCtrl.acceptRequest);
router.post("/requests/:id/reject", ...partnerOnly, writeLimiter, validateUuidParams("id"), appCtrl.rejectRequest);

router.get("/calendar", ...partnerOnly, validate(v.vendorCalendarQuerySchema, "query"), appCtrl.getCalendar);
router.get("/blocked-dates", ...partnerOnly, appCtrl.listBlockedDates);
router.post("/blocked-dates", ...partnerOnly, writeLimiter, validate(v.vendorBlockedDateSchema), appCtrl.addBlockedDate);
router.delete("/blocked-dates/:id", ...partnerOnly, writeLimiter, validateUuidParams("id"), appCtrl.removeBlockedDate);

router.get("/profile", ...partnerOnly, validate(v.vendorProfileQuerySchema, "query"), appCtrl.getProfile);
router.put("/profile", ...partnerOnly, writeLimiter, validate(v.vendorProfileUpdateSchema), appCtrl.updateProfile);
router.get("/services", ...partnerOnly, appCtrl.listServices);

router.get("/chats", ...partnerOnly, appCtrl.getChats);
router.get("/notifications/unread-count", ...partnerOnly, appCtrl.getUnreadNotifications);

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
