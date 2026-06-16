const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createVet, getAllVets, getVetById, updateVet, setAvailability, getAvailability } = require("../controllers/vetController");
const { createReview, getReviews } = require("../controllers/vetReviewController");
const { getVetServices, createVetService, updateVetService, deleteVetService, getAvailableSlots } = require("../controllers/vetServiceController");

router.post("/", verifyToken, createVet);
router.get("/", getAllVets);
router.get("/:id", getVetById);
router.put("/:id", verifyToken, updateVet);

// Availability
router.put("/:id/availability", verifyToken, setAvailability);
router.get("/:id/availability", getAvailability);

// Available time slots for a date — Screen 2 (Schedule)
router.get("/:vetId/slots", getAvailableSlots);

// Services offered by a vet — Screen 1 (Select Service)
router.get("/:vetId/services", getVetServices);
router.post("/:vetId/services", verifyToken, createVetService);
router.put("/:vetId/services/:serviceId", verifyToken, updateVetService);
router.delete("/:vetId/services/:serviceId", verifyToken, deleteVetService);

// Reviews
router.post("/:vetId/reviews", verifyToken, createReview);
router.get("/:vetId/reviews", getReviews);

module.exports = router;
