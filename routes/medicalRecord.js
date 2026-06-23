const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { createRecord, getRecordsByPet, getRecordById, updateRecord, deleteRecord } = require("../controllers/medicalRecordController");

router.post("/", verifyToken, writeLimiter, validate(v.createMedicalRecordSchema), createRecord);
router.get("/pet/:petId", verifyToken, validateUuidParams("petId"), getRecordsByPet);
router.get("/:id", verifyToken, validateUuidParams("id"), getRecordById);
router.put("/:id", verifyToken, writeLimiter, validateUuidParams("id"), validate(v.updateMedicalRecordSchema), updateRecord);
router.delete("/:id", verifyToken, writeLimiter, validateUuidParams("id"), deleteRecord);

module.exports = router;
