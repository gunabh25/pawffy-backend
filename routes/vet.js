const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { publicReadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { createVet, getAllVets, getVetById, updateVet, setAvailability, getAvailability } = require("../controllers/vetController");
const { createReview, getReviews } = require("../controllers/vetReviewController");
const { getVetServices, createVetService, updateVetService, deleteVetService, getAvailableSlots } = require("../controllers/vetServiceController");

router.get("/", publicReadLimiter, getAllVets);
router.get("/:id", publicReadLimiter, validateUuidParams("id"), getVetById);
router.get("/:id/availability", publicReadLimiter, validateUuidParams("id"), getAvailability);
router.get("/:vetId/slots", publicReadLimiter, validateUuidParams("vetId"), getAvailableSlots);
router.get("/:vetId/services", publicReadLimiter, validateUuidParams("vetId"), getVetServices);
router.get("/:vetId/reviews", publicReadLimiter, validateUuidParams("vetId"), getReviews);

router.post("/:vetId/reviews", verifyToken, writeLimiter, validateUuidParams("vetId"), validate(v.createReviewSchema), createReview);

router.post  ("/", verifyToken, requireRole("admin", "partner"), validate(v.createVetSchema), createVet);
router.put   ("/:id", verifyToken, requireRole("admin", "partner"), validateUuidParams("id"), validate(v.updateVetSchema), updateVet);
router.put   ("/:id/availability", verifyToken, requireRole("admin", "partner"), validateUuidParams("id"), setAvailability);
router.post  ("/:vetId/services", verifyToken, requireRole("admin", "partner"), validateUuidParams("vetId"), validate(v.createVetServiceSchema), createVetService);
router.put   ("/:vetId/services/:serviceId", verifyToken, requireRole("admin", "partner"), validateUuidParams("vetId", "serviceId"), updateVetService);
router.delete("/:vetId/services/:serviceId", verifyToken, requireRole("admin", "partner"), validateUuidParams("vetId", "serviceId"), deleteVetService);

module.exports = router;
