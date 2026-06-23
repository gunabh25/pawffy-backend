const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { addVaccination, getVaccinationsByPet, updateVaccination, deleteVaccination } = require("../controllers/vaccinationController");

router.post("/", verifyToken, writeLimiter, validate(v.createVaccinationSchema), addVaccination);
router.get("/pet/:petId", verifyToken, validateUuidParams("petId"), getVaccinationsByPet);
router.put("/:id", verifyToken, writeLimiter, validateUuidParams("id"), validate(v.updateVaccinationSchema), updateVaccination);
router.delete("/:id", verifyToken, writeLimiter, validateUuidParams("id"), deleteVaccination);

module.exports = router;
