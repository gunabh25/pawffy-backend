const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const v = require("../validators");
const { addVaccination, getVaccinationsByPet, updateVaccination, deleteVaccination } = require("../controllers/vaccinationController");

router.post("/", verifyToken, validate(v.createVaccinationSchema), addVaccination);
router.get("/pet/:petId", verifyToken, getVaccinationsByPet);
router.put("/:id", verifyToken, updateVaccination);
router.delete("/:id", verifyToken, deleteVaccination);

module.exports = router;
