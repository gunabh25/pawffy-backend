const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createVet, getAllVets, getVetById, updateVet, setAvailability, getAvailability } = require("../controllers/vetController");

router.post("/", verifyToken, createVet);
router.get("/", getAllVets);
router.get("/:id", getVetById);
router.put("/:id", verifyToken, updateVet);
router.put("/:id/availability", verifyToken, setAvailability);
router.get("/:id/availability", getAvailability);

module.exports = router;
