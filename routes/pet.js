const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const upload = require("../middleware/upload");
const { createPet, getMyPets, getPetById, updatePet, uploadPetImage, deletePet } = require("../controllers/petController");

router.post("/", verifyToken, createPet);
router.get("/", verifyToken, getMyPets);
router.get("/:id", verifyToken, getPetById);
router.put("/:id", verifyToken, updatePet);
router.post("/:id/image", verifyToken, upload.single("image"), uploadPetImage);
router.delete("/:id", verifyToken, deletePet);

module.exports = router;
