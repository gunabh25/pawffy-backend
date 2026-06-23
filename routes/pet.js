const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const { validateUuidParams } = require("../middleware/accessControl");
const { uploadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { createPet, getMyPets, getPetById, updatePet, uploadPetImage, deletePet } = require("../controllers/petController");

router.post  ("/",          verifyToken, writeLimiter, validate(v.createPetSchema), createPet);
router.get   ("/",          verifyToken, getMyPets);
router.get   ("/:id",       verifyToken, validateUuidParams("id"), getPetById);
router.put   ("/:id",       verifyToken, writeLimiter, validateUuidParams("id"), validate(v.updatePetSchema), updatePet);
router.post  ("/:id/image", verifyToken, uploadLimiter, validateUuidParams("id"), upload.single("image"), uploadPetImage);
router.delete("/:id",       verifyToken, writeLimiter, validateUuidParams("id"), deletePet);

module.exports = router;
