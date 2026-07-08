const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const documentUpload = require("../middleware/documentUpload");
const serviceMediaUpload = require("../middleware/serviceMediaUpload");
const upload = require("../middleware/upload");
const { validateUuidParams } = require("../middleware/accessControl");
const { uploadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const ctrl = require("../controllers/vendorOnboardingController");
const appCtrl = require("../controllers/vendorAppController");
const businessReviewCtrl = require("../controllers/businessReviewController");
const adoptionCtrl = require("../controllers/vendorAdoptionController");

const partnerOnly = [verifyToken, requireRole("partner")];
const adminOnly = [verifyToken, requireRole("admin")];

// ─── Main app screens (Home, Requests, Calendar, Profile, Chats) ─────────────
router.get("/home", ...partnerOnly, appCtrl.getHome);
router.patch("/status", ...partnerOnly, writeLimiter, validate(v.vendorOnlineStatusSchema), appCtrl.setOnlineStatus);

router.get("/requests", ...partnerOnly, validate(v.vendorRequestsQuerySchema, "query"), appCtrl.getRequests);
router.post("/requests/:id/accept", ...partnerOnly, writeLimiter, validateUuidParams("id"), appCtrl.acceptRequest);
router.post("/requests/:id/reject", ...partnerOnly, writeLimiter, validateUuidParams("id"), appCtrl.rejectRequest);
router.post("/requests/:id/start", ...partnerOnly, writeLimiter, validateUuidParams("id"), validate(v.vendorRequestStartSchema), appCtrl.startRequest);
router.patch("/requests/:id/progress", ...partnerOnly, writeLimiter, validateUuidParams("id"), validate(v.vendorRequestProgressSchema), appCtrl.updateRequestProgress);
router.post("/requests/:id/media", ...partnerOnly, uploadLimiter, validateUuidParams("id"), serviceMediaUpload.array("media", 10), appCtrl.addRequestMedia);
router.post("/requests/:id/location", ...partnerOnly, writeLimiter, validateUuidParams("id"), validate(v.vendorRequestLocationSchema), appCtrl.updateRequestLocation);
router.post(
  "/requests/:id/complete",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("id"),
  serviceMediaUpload.fields([
    { name: "prescriptionFile", maxCount: 1 },
    { name: "walkPhotos", maxCount: 10 },
    { name: "media", maxCount: 10 },
  ]),
  validate(v.vendorRequestCompleteSchema),
  appCtrl.completeRequest
);

router.get("/calendar", ...partnerOnly, validate(v.vendorCalendarQuerySchema, "query"), appCtrl.getCalendar);
router.get("/availability", ...partnerOnly, ctrl.getAvailability);
router.put("/availability", ...partnerOnly, writeLimiter, validate(v.vendorAvailabilitySchema), ctrl.manageAvailability);
router.get("/blocked-dates", ...partnerOnly, appCtrl.listBlockedDates);
router.post("/blocked-dates", ...partnerOnly, writeLimiter, validate(v.vendorBlockedDateSchema), appCtrl.addBlockedDate);
router.delete("/blocked-dates/:id", ...partnerOnly, writeLimiter, validateUuidParams("id"), appCtrl.removeBlockedDate);

router.get("/profile", ...partnerOnly, validate(v.vendorProfileQuerySchema, "query"), appCtrl.getProfile);
router.put("/profile", ...partnerOnly, writeLimiter, validate(v.vendorProfileUpdateSchema), appCtrl.updateProfile);
router.post("/profile/avatar", ...partnerOnly, uploadLimiter, upload.single("avatar"), appCtrl.uploadProfileAvatar);
router.put("/email", ...partnerOnly, writeLimiter, validate(v.vendorEmailUpdateSchema), appCtrl.updateEmail);
router.post("/phone/request-update", ...partnerOnly, writeLimiter, validate(v.vendorPhoneRequestUpdateSchema), appCtrl.requestPhoneUpdate);
router.post("/phone/verify-update", ...partnerOnly, writeLimiter, validate(v.vendorPhoneVerifyUpdateSchema), appCtrl.verifyPhoneUpdate);
router.get("/services", ...partnerOnly, appCtrl.listServices);
router.post("/services", ...partnerOnly, writeLimiter, validate(v.vendorServiceSchema), ctrl.createLiveService);
router.put(
  "/services/:id",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("id"),
  validate(v.vendorServiceUpdateSchema),
  ctrl.updateLiveService
);
router.delete(
  "/services/:id",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("id"),
  ctrl.deleteLiveService
);

router.get("/chats", ...partnerOnly, appCtrl.getChats);
router.get("/notifications/unread-count", ...partnerOnly, appCtrl.getUnreadNotifications);
router.get("/reviews", ...partnerOnly, validate(v.businessReviewsQuerySchema, "query"), businessReviewCtrl.getMyVendorReviews);
router.post("/reviews/:reviewId/reply", ...partnerOnly, writeLimiter, validateUuidParams("reviewId"), validate(v.replyToBusinessReviewSchema), businessReviewCtrl.replyToVendorReview);
router.get("/preferences/notifications", ...partnerOnly, appCtrl.getNotificationPreferences);
router.put(
  "/preferences/notifications",
  ...partnerOnly,
  writeLimiter,
  validate(v.vendorNotificationPreferencesSchema),
  appCtrl.updateNotificationPreferences
);
router.get("/adoptions", ...partnerOnly, validate(v.vendorAdoptionListQuerySchema, "query"), adoptionCtrl.listAdoptions);
router.get("/adoptions/:adoptionId", ...partnerOnly, validateUuidParams("adoptionId"), adoptionCtrl.getAdoption);
router.post(
  "/adoptions/:adoptionId/review",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("adoptionId"),
  validate(v.vendorAdoptionReviewSchema),
  adoptionCtrl.reviewAdoption
);
router.post(
  "/adoptions/:adoptionId/schedule-meet",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("adoptionId"),
  validate(v.vendorAdoptionScheduleMeetSchema),
  adoptionCtrl.scheduleMeet
);
router.post(
  "/adoptions/:adoptionId/meet-outcome",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("adoptionId"),
  validate(v.vendorAdoptionMeetOutcomeSchema),
  adoptionCtrl.recordMeetOutcome
);
router.post(
  "/adoptions/:adoptionId/documents",
  ...partnerOnly,
  uploadLimiter,
  validateUuidParams("adoptionId"),
  documentUpload.array("document", 10),
  validate(v.vendorAdoptionDocumentSchema),
  adoptionCtrl.uploadDocuments
);
router.post(
  "/adoptions/:adoptionId/collect-payment",
  ...partnerOnly,
  writeLimiter,
  validateUuidParams("adoptionId"),
  validate(v.vendorAdoptionCollectPaymentSchema),
  adoptionCtrl.collectPayment
);

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
