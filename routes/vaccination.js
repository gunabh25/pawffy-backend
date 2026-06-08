const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { addVaccination, getVaccinationsByPet, updateVaccination, deleteVaccination } = require("../controllers/vaccinationController");

router.post("/", verifyToken, addVaccination);
router.get("/pet/:petId", verifyToken, getVaccinationsByPet);
router.put("/:id", verifyToken, updateVaccination);
router.delete("/:id", verifyToken, deleteVaccination);

module.exports = router;
