const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const v = require("../validators");
const { createVet, getAllVets, getVetById, updateVet, setAvailability, getAvailability } = require("../controllers/vetController");
const { createReview, getReviews } = require("../controllers/vetReviewController");
const { getVetServices, createVetService, updateVetService, deleteVetService, getAvailableSlots } = require("../controllers/vetServiceController");

// Public
router.get("/",    getAllVets);
router.get("/:id", getVetById);
router.get("/:id/availability",  getAvailability);
router.get("/:vetId/slots",      getAvailableSlots);
router.get("/:vetId/services",   getVetServices);
router.get("/:vetId/reviews",    getReviews);

// Authenticated
router.post("/:vetId/reviews",   verifyToken, validate(v.createReviewSchema), createReview);

// Admin / Partner only
router.post  ("/",           verifyToken, requireRole("admin", "partner"), validate(v.createVetSchema),        createVet);
router.put   ("/:id",        verifyToken, requireRole("admin", "partner"), validate(v.updateVetSchema),        updateVet);
router.put   ("/:id/availability", verifyToken, requireRole("admin", "partner"),                               setAvailability);
router.post  ("/:vetId/services",  verifyToken, requireRole("admin", "partner"), validate(v.createVetServiceSchema), createVetService);
router.put   ("/:vetId/services/:serviceId", verifyToken, requireRole("admin", "partner"),                     updateVetService);
router.delete("/:vetId/services/:serviceId", verifyToken, requireRole("admin", "partner"),                     deleteVetService);

module.exports = router;
