const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createPet, getMyPets, getPetById, updatePet, deletePet } = require("../controllers/petController");

router.post("/", verifyToken, createPet);
router.get("/", verifyToken, getMyPets);
router.get("/:id", verifyToken, getPetById);
router.put("/:id", verifyToken, updatePet);
router.delete("/:id", verifyToken, deletePet);

module.exports = router;
