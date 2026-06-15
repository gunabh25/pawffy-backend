const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createVet, getAllVets, getVetById, updateVet, setAvailability, getAvailability } = require("../controllers/vetController");
const { createReview, getReviews } = require("../controllers/vetReviewController");

router.post("/", verifyToken, createVet);
router.get("/", getAllVets);
router.get("/:id", getVetById);
router.put("/:id", verifyToken, updateVet);
router.put("/:id/availability", verifyToken, setAvailability);
router.get("/:id/availability", getAvailability);
router.post("/:vetId/reviews", verifyToken, createReview);
router.get("/:vetId/reviews", getReviews);

module.exports = router;
