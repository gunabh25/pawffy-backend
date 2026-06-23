const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { createPet, getMyPets, getPetById, updatePet, uploadPetImage, deletePet } = require("../controllers/petController");

router.post  ("/",           verifyToken, validate(v.createPetSchema),   createPet);
router.get   ("/",           verifyToken,                                 getMyPets);
router.get   ("/:id",        verifyToken,                                 getPetById);
router.put   ("/:id",        verifyToken, validate(v.updatePetSchema),   updatePet);
router.post  ("/:id/image",  verifyToken, uploadLimiter, upload.single("image"), uploadPetImage);
router.delete("/:id",        verifyToken,                                 deletePet);

module.exports = router;
